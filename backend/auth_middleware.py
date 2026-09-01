"""
Authentication and Role-Based Access Control (RBAC) Middleware.
Verifies Firebase Auth ID tokens and attaches user details to Flask's global context (g).
"""

import os
from functools import wraps
from flask import request, jsonify, g
from firebase_admin import auth
import firebase_config

ADMIN_EMAILS = [
    email.strip().lower() 
    for email in os.getenv("ADMIN_EMAILS", "admin@cloudvault.edu,admin@example.com").split(",") 
    if email.strip()
]

def get_or_create_user_profile(uid, email=None, name=None):
    """
    Retrieves the user document from Firestore or provisions a new one.
    Assigns 'admin' if email is in ADMIN_EMAILS list, otherwise 'student'.
    """
    db = firebase_config.db
    if not db:
        # Fallback dictionary if Firestore is uninitialized
        is_admin = email and email.lower() in ADMIN_EMAILS
        return {
            "uid": uid,
            "email": email or "user@cloudvault.local",
            "name": name or (email.split("@")[0] if email else "CloudVault User"),
            "role": "admin" if is_admin else "student",
            "storage_used_bytes": 0,
            "created_at": None
        }

    try:
        user_ref = db.collection("users").document(uid)
        user_doc = user_ref.get()

        if user_doc.exists:
            user_data = user_doc.to_dict()
            # Double check if user email is in admin list to auto-grant admin if needed
            user_email = (user_data.get("email") or email or "").lower()
            if user_email in ADMIN_EMAILS and user_data.get("role") != "admin":
                user_data["role"] = "admin"
                user_ref.update({"role": "admin"})
            return user_data

        # Create new profile
        is_admin = email and email.lower() in ADMIN_EMAILS
        new_profile = {
            "uid": uid,
            "email": email or "",
            "name": name or (email.split("@")[0] if email else "Student User"),
            "role": "admin" if is_admin else "student",
            "storage_used_bytes": 0,
            "created_at": firestore.SERVER_TIMESTAMP
        }
        user_ref.set(new_profile)
        return new_profile

    except Exception as e:
        # Fallback profile on error
        is_admin = email and email.lower() in ADMIN_EMAILS
        return {
            "uid": uid,
            "email": email or "",
            "name": name or "Student User",
            "role": "admin" if is_admin else "student",
            "storage_used_bytes": 0
        }


def auth_required(f):
    """
    Middleware decorator that verifies Firebase ID Token in Authorization header.
    Attaches `g.uid` and `g.user` (with role) on successful validation.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")

        if not auth_header:
            return jsonify({
                "success": False,
                "message": "Authorization header is missing. Please log in."
            }), 401

        parts = auth_header.split(" ")
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return jsonify({
                "success": False,
                "message": "Invalid authorization header format. Expected 'Bearer <token>'."
            }), 401

        token = parts[1].strip()

        # Handle Mock/Dev token for local sandbox testing without Firebase setup
        if token.startswith("dev-token-") or token == "demo-admin-token" or token == "demo-student-token":
            is_admin = (token == "demo-admin-token")
            mock_uid = "admin_dev_uid" if is_admin else "student_dev_uid"
            mock_email = "admin@cloudvault.edu" if is_admin else "student@cloudvault.edu"
            g.uid = mock_uid
            g.user = {
                "uid": mock_uid,
                "email": mock_email,
                "name": "Dev Administrator" if is_admin else "Dev Student",
                "role": "admin" if is_admin else "student",
                "storage_used_bytes": 10485760
            }
            return f(*args, **kwargs)

        try:
            # Verify ID token using Firebase Admin SDK
            decoded_token = auth.verify_id_token(token)
            uid = decoded_token.get("uid")
            email = decoded_token.get("email", "")
            name = decoded_token.get("name") or decoded_token.get("display_name")

            if not uid:
                return jsonify({"success": False, "message": "Invalid token payload."}), 401

            user_profile = get_or_create_user_profile(uid, email=email, name=name)

            g.uid = uid
            g.user = user_profile
            g.token = decoded_token

        except auth.ExpiredIdTokenError:
            return jsonify({
                "success": False,
                "message": "Authentication token has expired. Please log in again."
            }), 401
        except auth.InvalidIdTokenError as e:
            return jsonify({
                "success": False,
                "message": f"Invalid authentication token: {str(e)}"
            }), 401
        except Exception as e:
            return jsonify({
                "success": False,
                "message": f"Authentication verification failed: {str(e)}"
            }), 401

        return f(*args, **kwargs)

    return decorated_function


def admin_required(f):
    """
    Middleware decorator that ensures the authenticated user has an 'admin' role.
    Must be used in conjunction with or after auth_required.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, "user") or not g.user:
            return jsonify({
                "success": False,
                "message": "Authentication required before role verification."
            }), 401

        role = g.user.get("role", "student")
        if role != "admin":
            return jsonify({
                "success": False,
                "message": "Forbidden: Administrative privileges required to access this resource."
            }), 403

        return f(*args, **kwargs)

    return decorated_function
