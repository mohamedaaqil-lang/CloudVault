"""
Student Analytics Routes for CloudVault.
Computes storage metrics, category breakdowns, file type distribution, and activity timelines for Chart.js.
"""

from collections import defaultdict
import datetime
from flask import Blueprint, jsonify, g
import firebase_config
from auth_middleware import auth_required

analytics_bp = Blueprint("analytics", __name__)

STUDENT_STORAGE_QUOTA_BYTES = 1 * 1024 * 1024 * 1024  # 1 GB default quota

def format_size(bytes_size):
    """Utility to format bytes to human readable string."""
    if not bytes_size or bytes_size < 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} TB"

@analytics_bp.route("/analytics", methods=["GET"])
@auth_required
def get_user_analytics():
    """
    Returns aggregated personal storage and document analytics for the logged-in student.
    """
    try:
        uid = g.uid
        db = firebase_config.db

        categories = {
            "Assignments": 0,
            "Certificates": 0,
            "Notes": 0,
            "Projects": 0,
            "Marksheets": 0,
            "General": 0
        }
        file_types = defaultdict(int)
        monthly_activity = defaultdict(int)
        
        total_documents = 0
        total_storage_bytes = 0
        all_docs = []
        total_folders = 0

        if db:
            # Query folders count
            folders_stream = db.collection("folders").where("userId", "==", uid).stream()
            for _ in folders_stream:
                total_folders += 1

            # Query all user documents
            docs_stream = db.collection("documents").where("userId", "==", uid).stream()
            for doc in docs_stream:
                d = doc.to_dict()
                d["id"] = doc.id
                all_docs.append(d)

                total_documents += 1
                size = d.get("fileSize", 0)
                total_storage_bytes += size

                # Category breakdown
                cat = d.get("category", "General")
                categories[cat] = categories.get(cat, 0) + 1

                # File type breakdown
                ftype = d.get("fileType", "OTHER").upper()
                file_types[ftype] += 1

                # Activity aggregation (by YYYY-MM or YYYY-MM-DD)
                upload_date_str = d.get("uploadDate", "")
                if upload_date_str:
                    try:
                        dt = datetime.datetime.fromisoformat(upload_date_str.replace("Z", "+00:00"))
                        month_key = dt.strftime("%b %Y")
                        monthly_activity[month_key] += 1
                    except Exception:
                        pass
        else:
            # Demo defaults
            categories = {"Assignments": 3, "Certificates": 2, "Notes": 5, "Projects": 4, "Marksheets": 1, "General": 2}
            file_types = {"PDF": 8, "DOCX": 4, "PNG": 3, "JPG": 2}
            monthly_activity = {"Jan": 2, "Feb": 4, "Mar": 6, "Apr": 5}
            total_documents = 17
            total_storage_bytes = 15485760
            total_folders = 3

        # Sort documents by date descending to get recent uploads
        all_docs.sort(key=lambda x: x.get("uploadDate", ""), reverse=True)
        recent_documents = all_docs[:5]

        # Calculate percentage used
        quota_bytes = STUDENT_STORAGE_QUOTA_BYTES
        storage_percentage = min(100.0, round((total_storage_bytes / quota_bytes) * 100, 2)) if quota_bytes else 0

        # Timeline formatted for Chart.js
        if not monthly_activity:
            now = datetime.datetime.now()
            monthly_activity = {
                (now - datetime.timedelta(days=30 * i)).strftime("%b %Y"): 0
                for i in range(5, -1, -1)
            }

        return jsonify({
            "success": True,
            "analytics": {
                "total_documents": total_documents,
                "total_storage_bytes": total_storage_bytes,
                "total_storage_formatted": format_size(total_storage_bytes),
                "storage_quota_bytes": quota_bytes,
                "storage_quota_formatted": format_size(quota_bytes),
                "storage_percentage": storage_percentage,
                "total_folders": total_folders,
                "categories": categories,
                "file_types": dict(file_types),
                "upload_timeline": {
                    "labels": list(monthly_activity.keys()),
                    "data": list(monthly_activity.values())
                },
                "recent_documents": recent_documents
            }
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to compute analytics: {str(e)}"}), 500
