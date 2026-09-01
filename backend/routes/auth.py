"""
Authentication & User Profile Routes for CloudVault.
Handles user creation sync and user profile inquiries.
"""

from flask import Blueprint, request, jsonify, g
from firebase_admin import firestore
import firebase_config
from auth_middleware import auth_required, get_or_create_user_profile, ADMIN_EMAILS

auth_bp = Blueprint("auth", __name__)

def format_size(bytes_size):
    """Utility to format bytes to human readable string."""
    if not bytes_size or bytes_size < 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

@auth_bp.route("/user/create", methods=["POST"])
def create_user():
    """
    Syncs newly registered Firebase Auth user into Firestore collection.
    """
    try:
        data = request.get_json(silent=True) or {}
        uid = data.get("uid")
        email = (data.get("email") or "").strip().lower()
        name = data.get("name", "").strip()

        if not uid or not email:
            return jsonify({
                "success": False,
                "message": "Missing required fields: 'uid' and 'email'."
            }), 400

        db = firebase_config.db
        if not db:
            is_admin = email in ADMIN_EMAILS
            return jsonify({
                "success": True,
                "message": "User profile initialized (Standby mode).",
                "user": {
                    "uid": uid,
                    "email": email,
                    "name": name or email.split("@")[0],
                    "role": "admin" if is_admin else "student",
                    "storage_used_bytes": 0
                }
            })

        user_ref = db.collection("users").document(uid)
        existing_doc = user_ref.get()

        is_admin = email in ADMIN_EMAILS
        role = "admin" if is_admin else "student"

        if existing_doc.exists:
            existing_data = existing_doc.to_dict()
            # Preserve existing role unless promoted
            if not is_admin and "role" in existing_data:
                role = existing_data["role"]
            user_ref.update({
                "name": name or existing_data.get("name", email.split("@")[0]),
                "email": email,
                "role": role,
                "updated_at": firestore.SERVER_TIMESTAMP
            })
            profile = {**existing_data, "name": name, "email": email, "role": role}
        else:
            profile = {
                "uid": uid,
                "email": email,
                "name": name or email.split("@")[0],
                "role": role,
                "storage_used_bytes": 0,
                "created_at": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP
            }
            user_ref.set(profile)

        return jsonify({
            "success": True,
            "message": "User profile created/synchronized successfully.",
            "user": {
                "uid": uid,
                "email": email,
                "name": profile.get("name"),
                "role": profile.get("role", "student")
            }
        }), 201

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error saving user profile: {str(e)}"
        }), 500


@auth_bp.route("/user/profile", methods=["GET"])
@auth_required
def get_user_profile():
    """
    Returns the authenticated user's profile and quota stats.
    """
    try:
        user_info = g.user
        uid = g.uid
        db = firebase_config.db

        doc_count = 0
        folder_count = 0
        total_storage_bytes = 0

        if db:
            # Query documents count and storage usage
            docs_query = db.collection("documents").where("userId", "==", uid).stream()
            for doc in docs_query:
                doc_count += 1
                doc_data = doc.to_dict()
                total_storage_bytes += doc_data.get("fileSize", 0)

            # Query folder count
            folders_query = db.collection("folders").where("userId", "==", uid).stream()
            for _ in folders_query:
                folder_count += 1

            # Update cached storage in user profile
            try:
                db.collection("users").document(uid).update({
                    "storage_used_bytes": total_storage_bytes
                })
            except Exception:
                pass
        else:
            total_storage_bytes = user_info.get("storage_used_bytes", 0)

        return jsonify({
            "success": True,
            "user": {
                "uid": uid,
                "name": user_info.get("name", "Student"),
                "email": user_info.get("email", ""),
                "role": user_info.get("role", "student"),
                "storage_used_bytes": total_storage_bytes,
                "storage_formatted": format_size(total_storage_bytes),
                "document_count": doc_count,
                "folder_count": folder_count
            }
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Failed to retrieve user profile: {str(e)}"
        }), 500
