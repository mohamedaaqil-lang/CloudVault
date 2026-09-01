"""
Folder Management Routes for CloudVault.
Handles creating, listing, renaming, and safely deleting student folders.
"""

import uuid
import datetime
from flask import Blueprint, request, jsonify, g
from firebase_admin import firestore
import firebase_config
from auth_middleware import auth_required

folders_bp = Blueprint("folders", __name__)

def format_size(bytes_size):
    """Utility to format bytes to human readable string."""
    if not bytes_size or bytes_size < 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

@folders_bp.route("/folders", methods=["POST"])
@auth_required
def create_folder():
    """
    Creates a new folder for the authenticated student.
    """
    try:
        data = request.get_json(silent=True) or {}
        folder_name = data.get("name", "").strip()
        color = data.get("color", "#2563eb").strip()

        if not folder_name:
            return jsonify({"success": False, "message": "Folder name is required."}), 400

        if len(folder_name) > 60:
            return jsonify({"success": False, "message": "Folder name cannot exceed 60 characters."}), 400

        uid = g.uid
        db = firebase_config.db

        if not db:
            folder_obj = {
                "id": str(uuid.uuid4()),
                "name": folder_name,
                "userId": uid,
                "color": color,
                "document_count": 0,
                "total_size_formatted": "0 B",
                "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            return jsonify({
                "success": True,
                "message": "Folder created successfully.",
                "folder": folder_obj
            }), 201

        # Check for duplicate folder name under this user
        existing_folders = db.collection("folders")\
            .where("userId", "==", uid)\
            .where("name", "==", folder_name)\
            .stream()

        if any(existing_folders):
            return jsonify({
                "success": False,
                "message": f"A folder named '{folder_name}' already exists."
            }), 409

        folder_data = {
            "name": folder_name,
            "userId": uid,
            "color": color,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "updatedAt": firestore.SERVER_TIMESTAMP
        }

        folder_ref = db.collection("folders").add(folder_data)
        folder_id = folder_ref[1].id

        return jsonify({
            "success": True,
            "message": "Folder created successfully.",
            "folder": {
                "id": folder_id,
                "name": folder_name,
                "color": color,
                "document_count": 0,
                "total_size_formatted": "0 B",
                "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
        }), 201

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to create folder: {str(e)}"}), 500


@folders_bp.route("/folders", methods=["GET"])
@auth_required
def get_folders():
    """
    Retrieves all folders owned by the student, along with document counts and total sizes.
    """
    try:
        uid = g.uid
        db = firebase_config.db
        folders = []

        if not db:
            return jsonify({"success": True, "folders": []})

        # Fetch folders
        folders_stream = db.collection("folders").where("userId", "==", uid).stream()
        folder_map = {}

        for doc in folders_stream:
            data = doc.to_dict()
            f_id = doc.id
            folder_map[f_id] = {
                "id": f_id,
                "name": data.get("name", "Untitled Folder"),
                "color": data.get("color", "#2563eb"),
                "document_count": 0,
                "total_size_bytes": 0,
                "createdAt": data.get("createdAt")
            }

        # Calculate counts and sizes from documents
        docs_stream = db.collection("documents").where("userId", "==", uid).stream()
        for doc in docs_stream:
            d_data = doc.to_dict()
            f_id = d_data.get("folderId")
            if f_id and f_id in folder_map:
                folder_map[f_id]["document_count"] += 1
                folder_map[f_id]["total_size_bytes"] += d_data.get("fileSize", 0)

        for f_data in folder_map.values():
            f_data["total_size_formatted"] = format_size(f_data["total_size_bytes"])
            # Format timestamp if Firestore timestamp
            if hasattr(f_data.get("createdAt"), "isoformat"):
                f_data["createdAt"] = f_data["createdAt"].isoformat()
            folders.append(f_data)

        # Sort folders alphabetically by name
        folders.sort(key=lambda x: x["name"].lower())

        return jsonify({
            "success": True,
            "count": len(folders),
            "folders": folders
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to fetch folders: {str(e)}"}), 500


@folders_bp.route("/folders/<folder_id>", methods=["PUT"])
@auth_required
def rename_folder(folder_id):
    """
    Renames a folder and updates all linked documents.
    """
    try:
        data = request.get_json(silent=True) or {}
        new_name = data.get("name", "").strip()
        new_color = data.get("color", "").strip()

        if not new_name:
            return jsonify({"success": False, "message": "Folder name is required."}), 400

        uid = g.uid
        db = firebase_config.db

        if not db:
            return jsonify({"success": False, "message": "Database not initialized."}), 503

        folder_ref = db.collection("folders").document(folder_id)
        folder_doc = folder_ref.get()

        if not folder_doc.exists:
            return jsonify({"success": False, "message": "Folder not found."}), 404

        folder_data = folder_doc.to_dict()
        if folder_data.get("userId") != uid and g.user.get("role") != "admin":
            return jsonify({"success": False, "message": "Unauthorized."}), 403

        update_payload = {
            "name": new_name,
            "updatedAt": firestore.SERVER_TIMESTAMP
        }
        if new_color:
            update_payload["color"] = new_color

        folder_ref.update(update_payload)

        # Update folderName on all documents inside this folder
        docs_inside = db.collection("documents").where("folderId", "==", folder_id).stream()
        for d in docs_inside:
            db.collection("documents").document(d.id).update({"folderName": new_name})

        return jsonify({
            "success": True,
            "message": "Folder updated successfully.",
            "folder": {
                "id": folder_id,
                "name": new_name,
                "color": new_color or folder_data.get("color", "#2563eb")
            }
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to update folder: {str(e)}"}), 500


@folders_bp.route("/folders/<folder_id>", methods=["DELETE"])
@auth_required
def delete_folder(folder_id):
    """
    Deletes a folder. By default, safely unlinks documents without deleting them,
    or deletes all files if 'delete_files=true' is passed.
    """
    try:
        delete_files = request.args.get("delete_files", "false").lower() == "true"
        uid = g.uid
        db = firebase_config.db
        bucket = firebase_config.bucket
        is_admin = g.user.get("role") == "admin"

        if not db:
            return jsonify({"success": False, "message": "Database not initialized."}), 503

        folder_ref = db.collection("folders").document(folder_id)
        folder_doc = folder_ref.get()

        if not folder_doc.exists:
            return jsonify({"success": False, "message": "Folder not found."}), 404

        folder_data = folder_doc.to_dict()
        if folder_data.get("userId") != uid and not is_admin:
            return jsonify({"success": False, "message": "Unauthorized."}), 403

        # Process documents in this folder
        docs_inside = db.collection("documents").where("folderId", "==", folder_id).stream()
        
        for d in docs_inside:
            d_id = d.id
            d_data = d.to_dict()
            if delete_files:
                # Delete from Cloud Storage
                storage_path = d_data.get("storagePath")
                if storage_path and bucket:
                    try:
                        blob = bucket.blob(storage_path)
                        if blob.exists():
                            blob.delete()
                    except Exception:
                        pass
                db.collection("documents").document(d_id).delete()
            else:
                # Safely preserve documents by moving them to root
                db.collection("documents").document(d_id).update({
                    "folderId": None,
                    "folderName": None
                })

        # Delete the folder document itself
        folder_ref.delete()

        return jsonify({
            "success": True,
            "message": f"Folder deleted successfully.{' Associated documents were also deleted.' if delete_files else ' Associated documents were moved to Root.'}"
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to delete folder: {str(e)}"}), 500
