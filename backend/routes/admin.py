"""
Administrator Management Routes for CloudVault.
Enforces admin role verification and provides platform analytics, user registry, and document moderation.
"""

from collections import defaultdict
import datetime
import os
from pathlib import Path
from flask import Blueprint, request, jsonify, g
from firebase_admin import firestore
import firebase_config
from auth_middleware import auth_required, admin_required

admin_bp = Blueprint("admin", __name__)

def format_size(bytes_size):
    """Utility to format bytes to human readable string."""
    if not bytes_size or bytes_size < 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

@admin_bp.route("/admin/analytics", methods=["GET"])
@auth_required
@admin_required
def get_admin_analytics():
    """
    Returns platform-wide storage, user, and document telemetry for the Admin Dashboard.
    """
    try:
        db = firebase_config.db
        
        total_users = 0
        total_documents = 0
        total_storage_bytes = 0
        total_folders = 0
        
        category_distribution = defaultdict(int)
        file_type_distribution = defaultdict(int)
        activity_timeline = defaultdict(int)
        users_list = []

        if db:
            # Query users
            users_stream = db.collection("users").stream()
            for u in users_stream:
                total_users += 1
                u_data = u.to_dict()
                u_data["uid"] = u.id
                if hasattr(u_data.get("created_at"), "isoformat"):
                    u_data["created_at"] = u_data["created_at"].isoformat()
                users_list.append(u_data)

            # Query folders
            folders_stream = db.collection("folders").stream()
            for _ in folders_stream:
                total_folders += 1

            # Query documents
            docs_stream = db.collection("documents").stream()
            for doc in docs_stream:
                total_documents += 1
                d_data = doc.to_dict()
                size = d_data.get("fileSize", 0)
                total_storage_bytes += size

                cat = d_data.get("category", "General")
                category_distribution[cat] += 1

                ftype = d_data.get("fileType", "OTHER").upper()
                file_type_distribution[ftype] += 1

                upload_date = d_data.get("uploadDate", "")
                if upload_date:
                    try:
                        dt = datetime.datetime.fromisoformat(upload_date.replace("Z", "+00:00"))
                        month_key = dt.strftime("%b %Y")
                        activity_timeline[month_key] += 1
                    except Exception:
                        pass
        else:
            total_users = 12
            total_documents = 48
            total_storage_bytes = 142000000
            total_folders = 18
            category_distribution = {"Assignments": 20, "Projects": 12, "Notes": 8, "Certificates": 5, "Marksheets": 3}
            file_type_distribution = {"PDF": 25, "DOCX": 10, "PNG": 8, "JPG": 5}
            activity_timeline = {"Jan": 8, "Feb": 12, "Mar": 18, "Apr": 10}

        # Sort users by registration date for recent list
        users_list.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
        recent_users = users_list[:5]

        return jsonify({
            "success": True,
            "analytics": {
                "total_users": total_users,
                "total_documents": total_documents,
                "total_storage_bytes": total_storage_bytes,
                "total_storage_formatted": format_size(total_storage_bytes),
                "total_folders": total_folders,
                "category_distribution": dict(category_distribution),
                "file_type_distribution": dict(file_type_distribution),
                "activity_timeline": {
                    "labels": list(activity_timeline.keys()),
                    "data": list(activity_timeline.values())
                },
                "recent_users": recent_users
            }
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to retrieve admin analytics: {str(e)}"}), 500


@admin_bp.route("/admin/users", methods=["GET"])
@auth_required
@admin_required
def get_all_users():
    """
    Retrieves all registered students and admins with their document counts and storage usage.
    """
    try:
        db = firebase_config.db
        search_query = request.args.get("search", "").strip().lower()
        role_filter = request.args.get("role", "").strip().lower()

        users_list = []

        if db:
            # Map document counts and storage per user
            user_doc_counts = defaultdict(int)
            user_storage_map = defaultdict(int)

            docs_stream = db.collection("documents").stream()
            for d in docs_stream:
                d_data = d.to_dict()
                u_id = d_data.get("userId")
                if u_id:
                    user_doc_counts[u_id] += 1
                    user_storage_map[u_id] += d_data.get("fileSize", 0)

            # Get user profiles
            users_stream = db.collection("users").stream()
            for u in users_stream:
                u_data = u.to_dict()
                u_id = u.id
                u_data["uid"] = u_id
                u_data["document_count"] = user_doc_counts[u_id]
                u_data["storage_used_bytes"] = user_storage_map[u_id]
                u_data["storage_used_formatted"] = format_size(user_storage_map[u_id])
                
                if hasattr(u_data.get("created_at"), "isoformat"):
                    u_data["created_at"] = u_data["created_at"].isoformat()
                elif not u_data.get("created_at"):
                    u_data["created_at"] = "N/A"

                users_list.append(u_data)
        else:
            users_list = [
                {
                    "uid": "usr_demo_1",
                    "name": "Sarah Connor",
                    "email": "sarah.c@university.edu",
                    "role": "student",
                    "document_count": 8,
                    "storage_used_bytes": 14200000,
                    "storage_used_formatted": "13.5 MB",
                    "created_at": "2026-08-15"
                },
                {
                    "uid": "usr_demo_2",
                    "name": "Alex Mercer",
                    "email": "alex.m@university.edu",
                    "role": "student",
                    "document_count": 14,
                    "storage_used_bytes": 28400000,
                    "storage_used_formatted": "27.1 MB",
                    "created_at": "2026-08-20"
                }
            ]

        # Apply search and role filters
        if role_filter and role_filter != "all":
            users_list = [u for u in users_list if u.get("role", "").lower() == role_filter]

        if search_query:
            users_list = [
                u for u in users_list
                if search_query in u.get("name", "").lower()
                or search_query in u.get("email", "").lower()
            ]

        return jsonify({
            "success": True,
            "count": len(users_list),
            "users": users_list
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to retrieve users: {str(e)}"}), 500


@admin_bp.route("/admin/users/<target_uid>/role", methods=["PUT"])
@auth_required
@admin_required
def update_user_role(target_uid):
    """
    Allows an administrator to toggle or promote/demote a user's role ('student' <-> 'admin').
    """
    try:
        data = request.get_json(silent=True) or {}
        new_role = data.get("role", "").strip().lower()

        if new_role not in ["student", "admin"]:
            return jsonify({"success": False, "message": "Role must be either 'student' or 'admin'."}), 400

        # Prevent admin from accidentally demoting themselves if they are the current user
        if target_uid == g.uid and new_role != "admin":
            return jsonify({
                "success": False,
                "message": "You cannot remove your own administrative role."
            }), 400

        db = firebase_config.db
        if not db:
            return jsonify({"success": True, "message": f"Role updated to '{new_role}' (Standby mode)."})

        user_ref = db.collection("users").document(target_uid)
        user_doc = user_ref.get()

        if not user_doc.exists:
            return jsonify({"success": False, "message": "User not found."}), 404

        user_ref.update({
            "role": new_role,
            "role_updated_at": firestore.SERVER_TIMESTAMP,
            "role_updated_by": g.user.get("email")
        })

        return jsonify({
            "success": True,
            "message": f"User role successfully changed to '{new_role}'.",
            "uid": target_uid,
            "new_role": new_role
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to update user role: {str(e)}"}), 500


@admin_bp.route("/admin/documents", methods=["GET"])
@auth_required
@admin_required
def get_all_documents():
    """
    Retrieves all student documents across the system for monitoring and moderation.
    """
    try:
        db = firebase_config.db
        search_query = request.args.get("search", "").strip().lower()
        category_filter = request.args.get("category", "").strip()
        file_type_filter = request.args.get("file_type", "").strip().upper()

        documents = []

        if db:
            docs_stream = db.collection("documents").stream()
            for doc in docs_stream:
                d = doc.to_dict()
                d["id"] = doc.id
                documents.append(d)
        else:
            documents = []

        # Filters
        if category_filter and category_filter != "All":
            documents = [d for d in documents if d.get("category") == category_filter]

        if file_type_filter and file_type_filter != "ALL":
            documents = [d for d in documents if d.get("fileType", "").upper() == file_type_filter]

        if search_query:
            documents = [
                d for d in documents
                if search_query in d.get("fileName", "").lower()
                or search_query in d.get("userName", "").lower()
                or search_query in d.get("userEmail", "").lower()
                or search_query in d.get("category", "").lower()
            ]

        # Sort newest first
        documents.sort(key=lambda x: x.get("uploadDate", ""), reverse=True)

        return jsonify({
            "success": True,
            "count": len(documents),
            "documents": documents
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to retrieve all documents: {str(e)}"}), 500


@admin_bp.route("/admin/documents/<document_id>", methods=["DELETE"])
@auth_required
@admin_required
def admin_delete_document(document_id):
    """
    Allows administrators to delete inappropriate or violating documents across any student account.
    """
    try:
        reason = request.args.get("reason", "Administrative moderation").strip()
        db = firebase_config.db
        bucket = firebase_config.bucket

        if not db:
            return jsonify({"success": False, "message": "Database not initialized."}), 503

        doc_ref = db.collection("documents").document(document_id)
        doc_snapshot = doc_ref.get()

        if not doc_snapshot.exists:
            return jsonify({"success": False, "message": "Document not found."}), 404

        doc_data = doc_snapshot.to_dict()
        storage_path = doc_data.get("storagePath")

        # Delete from Cloud Storage
        if storage_path:
            if bucket and not storage_path.startswith("local://"):
                try:
                    blob = bucket.blob(storage_path)
                    if blob.exists():
                        blob.delete()
                except Exception as e:
                    print(f"Warning: Storage deletion error during admin moderation: {e}")
            elif storage_path.startswith("local://"):
                local_rel = storage_path.replace("local://", "")
                local_full = Path(__file__).resolve().parent.parent / local_rel
                if local_full.exists():
                    try:
                        os.remove(local_full)
                    except Exception:
                        pass

        # Remove from Firestore
        doc_ref.delete()

        # Update owner's storage count
        owner_uid = doc_data.get("userId")
        if owner_uid:
            try:
                user_ref = db.collection("users").document(owner_uid)
                u_doc = user_ref.get()
                if u_doc.exists:
                    current_used = u_doc.to_dict().get("storage_used_bytes", 0)
                    new_used = max(0, current_used - doc_data.get("fileSize", 0))
                    user_ref.update({"storage_used_bytes": new_used})
            except Exception:
                pass

        return jsonify({
            "success": True,
            "message": f"Document '{doc_data.get('fileName')}' deleted by Administrator ({reason})."
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Admin deletion failed: {str(e)}"}), 500
