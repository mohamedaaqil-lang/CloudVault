"""
Document Management Routes for CloudVault.
Handles secure upload, listing, filtering, search, short-lived signed URL generation, and deletion.
"""

import os
import uuid
import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify, g, send_file
from werkzeug.utils import secure_filename
from firebase_admin import firestore
import firebase_config
from auth_middleware import auth_required

documents_bp = Blueprint("documents", __name__)

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "txt", "jpg", "jpeg", "png"}
ALLOWED_CATEGORIES = {"Assignments", "Certificates", "Notes", "Projects", "Marksheets", "General"}
MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50")) * 1024 * 1024

MIME_TYPES = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png"
}

def format_size(bytes_size):
    """Utility to format bytes to human readable string."""
    if not bytes_size or bytes_size < 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

def is_allowed_file(filename):
    """Checks whether the file extension is allowed."""
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in ALLOWED_EXTENSIONS

@documents_bp.route("/documents/upload", methods=["POST"])
@auth_required
def upload_document():
    """
    Securely uploads a student document to Firebase Storage and stores metadata in Firestore.
    """
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "message": "No file payload found in the request."}), 400

        file = request.files["file"]
        if not file or file.filename.strip() == "":
            return jsonify({"success": False, "message": "No file selected."}), 400

        original_filename = secure_filename(file.filename)
        if not original_filename:
            original_filename = f"upload_{uuid.uuid4().hex[:8]}.dat"

        if not is_allowed_file(original_filename):
            return jsonify({
                "success": False,
                "message": f"File type not permitted. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
            }), 400

        # Read file content for size check and upload
        file_bytes = file.read()
        file_size = len(file_bytes)

        if file_size > MAX_FILE_SIZE_BYTES:
            max_mb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
            return jsonify({
                "success": False,
                "message": f"File size exceeds maximum allowable limit of {max_mb:.0f} MB."
            }), 400

        category = request.form.get("category", "General").strip()
        if category not in ALLOWED_CATEGORIES:
            category = "General"

        folder_id = request.form.get("folder_id", "").strip() or None
        folder_name = request.form.get("folder_name", "").strip() or None

        uid = g.uid
        ext = original_filename.rsplit(".", 1)[1].lower()
        content_type = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")

        storage_filename = f"documents/{uid}/{uuid.uuid4().hex}_{original_filename}"
        
        db = firebase_config.db
        bucket = firebase_config.bucket

        if bucket:
            # Upload securely to Cloud Storage (private blob, no make_public)
            blob = bucket.blob(storage_filename)
            blob.upload_from_string(file_bytes, content_type=content_type)
        else:
            # Local fallback storage when credentials not provided
            local_upload_dir = Path(__file__).resolve().parent.parent / "temp_storage" / uid
            local_upload_dir.mkdir(parents=True, exist_ok=True)
            local_file_path = local_upload_dir / f"{uuid.uuid4().hex}_{original_filename}"
            with open(local_file_path, "wb") as f:
                f.write(file_bytes)
            storage_filename = f"local://{local_file_path.relative_to(Path(__file__).resolve().parent.parent)}"

        doc_data = {
            "userId": uid,
            "userEmail": g.user.get("email", ""),
            "userName": g.user.get("name", ""),
            "fileName": original_filename,
            "fileType": ext.upper(),
            "fileSize": file_size,
            "fileSizeFormatted": format_size(file_size),
            "category": category,
            "folderId": folder_id,
            "folderName": folder_name,
            "storagePath": storage_filename,
            "contentType": content_type,
            "uploadDate": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "createdAt": firestore.SERVER_TIMESTAMP if db else None
        }

        doc_id = str(uuid.uuid4())
        if db:
            doc_ref = db.collection("documents").add(doc_data)
            doc_id = doc_ref[1].id
            doc_data["id"] = doc_id
        else:
            doc_data["id"] = doc_id

        return jsonify({
            "success": True,
            "message": "Document uploaded successfully.",
            "document": doc_data
        }), 201

    except Exception as e:
        return jsonify({"success": False, "message": f"Upload failed: {str(e)}"}), 500


@documents_bp.route("/documents", methods=["GET"])
@auth_required
def get_documents():
    """
    Retrieves student documents with dynamic search, category, folder, and sort filters.
    """
    try:
        uid = g.uid
        db = firebase_config.db

        category_filter = request.args.get("category", "").strip()
        folder_filter = request.args.get("folder_id", "").strip()
        file_type_filter = request.args.get("file_type", "").strip().upper()
        search_query = request.args.get("search", "").strip().lower()
        sort_by = request.args.get("sort", "newest").strip().lower()

        documents = []

        if db:
            query = db.collection("documents").where("userId", "==", uid)

            if category_filter and category_filter != "All":
                query = query.where("category", "==", category_filter)

            if folder_filter and folder_filter != "all":
                if folder_filter == "root" or folder_filter == "none":
                    query = query.where("folderId", "==", None)
                else:
                    query = query.where("folderId", "==", folder_filter)

            docs_stream = query.stream()
            for doc in docs_stream:
                d = doc.to_dict()
                d["id"] = doc.id
                documents.append(d)
        else:
            # Standby demo document array
            documents = []

        # Apply in-memory file type and search filtering
        if file_type_filter and file_type_filter != "ALL":
            documents = [d for d in documents if d.get("fileType", "").upper() == file_type_filter]

        if search_query:
            documents = [
                d for d in documents
                if search_query in d.get("fileName", "").lower()
                or search_query in d.get("category", "").lower()
                or search_query in d.get("fileType", "").lower()
                or (d.get("folderName") and search_query in d.get("folderName", "").lower())
            ]

        # Sorting
        if sort_by == "oldest":
            documents.sort(key=lambda x: x.get("uploadDate", ""))
        elif sort_by == "name_asc":
            documents.sort(key=lambda x: x.get("fileName", "").lower())
        elif sort_by == "name_desc":
            documents.sort(key=lambda x: x.get("fileName", "").lower(), reverse=True)
        elif sort_by == "size_desc":
            documents.sort(key=lambda x: x.get("fileSize", 0), reverse=True)
        elif sort_by == "size_asc":
            documents.sort(key=lambda x: x.get("fileSize", 0))
        else: # newest default
            documents.sort(key=lambda x: x.get("uploadDate", ""), reverse=True)

        return jsonify({
            "success": True,
            "count": len(documents),
            "documents": documents
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to fetch documents: {str(e)}"}), 500


@documents_bp.route("/documents/<document_id>/download", methods=["GET"])
@auth_required
def download_document(document_id):
    """
    Generates a secure, short-lived signed download URL (15 mins) for a private storage object.
    Verifies user ownership or admin privileges.
    """
    try:
        db = firebase_config.db
        bucket = firebase_config.bucket
        uid = g.uid
        is_admin = g.user.get("role") == "admin"

        if not db:
            return jsonify({
                "success": False,
                "message": "Database not initialized. Please ensure Firebase credentials are setup."
            }), 503

        doc_ref = db.collection("documents").document(document_id)
        doc_snapshot = doc_ref.get()

        if not doc_snapshot.exists:
            return jsonify({"success": False, "message": "Document not found."}), 404

        doc_data = doc_snapshot.to_dict()

        # Security check: document must belong to the user unless requester is admin
        if doc_data.get("userId") != uid and not is_admin:
            return jsonify({
                "success": False,
                "message": "Access denied. You do not have permission to download this document."
            }), 403

        storage_path = doc_data.get("storagePath")
        if not storage_path:
            return jsonify({"success": False, "message": "Storage reference missing for document."}), 404

        # If bucket is live, generate signed URL
        if bucket and not storage_path.startswith("local://"):
            blob = bucket.blob(storage_path)
            if not blob.exists():
                return jsonify({"success": False, "message": "File not found in storage bucket."}), 404

            # Generate v4 short-lived signed URL (15 minutes expiry)
            signed_url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=15),
                method="GET",
                response_disposition=f'attachment; filename="{doc_data.get("fileName")}"'
            )

            return jsonify({
                "success": True,
                "download_url": signed_url,
                "filename": doc_data.get("fileName"),
                "expires_in_minutes": 15
            })
        elif storage_path.startswith("local://"):
            local_rel = storage_path.replace("local://", "")
            local_full = Path(__file__).resolve().parent.parent / local_rel
            if local_full.exists():
                return send_file(
                    local_full,
                    as_attachment=True,
                    download_name=doc_data.get("fileName"),
                    mimetype=doc_data.get("contentType")
                )
            return jsonify({"success": False, "message": "Local file missing."}), 404
        else:
            return jsonify({
                "success": False,
                "message": "Cloud Storage bucket not configured. Please supply Firebase credentials."
            }), 503

    except Exception as e:
        return jsonify({"success": False, "message": f"Download request failed: {str(e)}"}), 500


@documents_bp.route("/documents/<document_id>/view", methods=["GET"])
@auth_required
def view_document(document_id):
    """
    Generates a secure inline preview URL (15 mins) for PDF and images.
    """
    try:
        db = firebase_config.db
        bucket = firebase_config.bucket
        uid = g.uid
        is_admin = g.user.get("role") == "admin"

        if not db:
            return jsonify({"success": False, "message": "Database not initialized."}), 503

        doc_ref = db.collection("documents").document(document_id)
        doc_snapshot = doc_ref.get()

        if not doc_snapshot.exists:
            return jsonify({"success": False, "message": "Document not found."}), 404

        doc_data = doc_snapshot.to_dict()

        if doc_data.get("userId") != uid and not is_admin:
            return jsonify({"success": False, "message": "Access denied."}), 403

        storage_path = doc_data.get("storagePath")
        if not storage_path:
            return jsonify({"success": False, "message": "Storage path missing."}), 404

        if bucket and not storage_path.startswith("local://"):
            blob = bucket.blob(storage_path)
            preview_url = blob.generate_signed_url(
                version="v4",
                expiration=datetime.timedelta(minutes=15),
                method="GET",
                response_disposition=f'inline; filename="{doc_data.get("fileName")}"'
            )
            return jsonify({
                "success": True,
                "preview_url": preview_url,
                "document": {
                    "id": document_id,
                    "fileName": doc_data.get("fileName"),
                    "fileType": doc_data.get("fileType"),
                    "category": doc_data.get("category"),
                    "fileSizeFormatted": doc_data.get("fileSizeFormatted"),
                    "uploadDate": doc_data.get("uploadDate")
                }
            })
        elif storage_path.startswith("local://"):
            local_rel = storage_path.replace("local://", "")
            local_full = Path(__file__).resolve().parent.parent / local_rel
            if local_full.exists():
                return send_file(
                    local_full,
                    as_attachment=False,
                    mimetype=doc_data.get("contentType")
                )
            return jsonify({"success": False, "message": "Local file missing."}), 404
        else:
            return jsonify({"success": False, "message": "Storage not configured."}), 503

    except Exception as e:
        return jsonify({"success": False, "message": f"Preview failed: {str(e)}"}), 500


@documents_bp.route("/documents/<document_id>", methods=["DELETE"])
@auth_required
def delete_document(document_id):
    """
    Deletes a document from Firebase Storage and Firestore.
    Verifies that the user owns the document or is an admin.
    """
    try:
        db = firebase_config.db
        bucket = firebase_config.bucket
        uid = g.uid
        is_admin = g.user.get("role") == "admin"

        if not db:
            return jsonify({"success": False, "message": "Database not initialized."}), 503

        doc_ref = db.collection("documents").document(document_id)
        doc_snapshot = doc_ref.get()

        if not doc_snapshot.exists:
            return jsonify({"success": False, "message": "Document not found."}), 404

        doc_data = doc_snapshot.to_dict()

        # Authorization check
        if doc_data.get("userId") != uid and not is_admin:
            return jsonify({
                "success": False,
                "message": "Unauthorized. You cannot delete documents belonging to other users."
            }), 403

        # Delete from Cloud Storage
        storage_path = doc_data.get("storagePath")
        if storage_path:
            if bucket and not storage_path.startswith("local://"):
                try:
                    blob = bucket.blob(storage_path)
                    if blob.exists():
                        blob.delete()
                except Exception as storage_err:
                    print(f"Warning: Cloud Storage deletion error: {storage_err}")
            elif storage_path.startswith("local://"):
                local_rel = storage_path.replace("local://", "")
                local_full = Path(__file__).resolve().parent.parent / local_rel
                if local_full.exists():
                    try:
                        os.remove(local_full)
                    except Exception:
                        pass

        # Delete document record from Firestore
        doc_ref.delete()

        # Update user's aggregate storage in background/profile
        owner_uid = doc_data.get("userId")
        try:
            user_ref = db.collection("users").document(owner_uid)
            user_doc = user_ref.get()
            if user_doc.exists:
                current_used = user_doc.to_dict().get("storage_used_bytes", 0)
                new_used = max(0, current_used - doc_data.get("fileSize", 0))
                user_ref.update({"storage_used_bytes": new_used})
        except Exception:
            pass

        return jsonify({
            "success": True,
            "message": "Document deleted successfully."
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Deletion failed: {str(e)}"}), 500
