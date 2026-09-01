"""
CloudVault: Secure Cloud-Based Student Document Management System
Main Flask Application Server & REST API Gateway.
"""

import os
import sys
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# Add backend directory to sys.path for robust module imports
backend_path = Path(__file__).resolve().parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import firebase_config
from routes.auth import auth_bp
from routes.documents import documents_bp
from routes.folders import folders_bp
from routes.analytics import analytics_bp
from routes.admin import admin_bp

def create_app():
    """Application factory for CloudVault Flask API."""
    # Determine frontend directory for optional static serving
    frontend_dir = backend_path.parent / "frontend"

    app = Flask(
        __name__,
        static_folder=str(frontend_dir) if frontend_dir.exists() else None,
        static_url_path=""
    )

    # Load configuration
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "cloudvault_secure_internship_secret_key_2026")
    max_mb = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    app.config["MAX_CONTENT_LENGTH"] = max_mb * 1024 * 1024

    # Enable CORS for all REST API endpoints
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    )

    # Register Blueprints
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(documents_bp, url_prefix="/api")
    app.register_blueprint(folders_bp, url_prefix="/api")
    app.register_blueprint(analytics_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api")

    # API Health & Status Endpoint
    @app.route("/api/health", methods=["GET"])
    @app.route("/", methods=["GET"])
    def health_check():
        firebase_status = "Connected" if firebase_config.is_firebase_initialized else "Standby (Awaiting serviceAccountKey.json)"
        return jsonify({
            "project": "CloudVault - Secure Cloud-Based Student Document Management System",
            "version": "1.0.0",
            "status": "Healthy",
            "firebase_admin_status": firebase_status,
            "storage_bucket": os.getenv("FIREBASE_STORAGE_BUCKET", "Not specified"),
            "endpoints": [
                "/api/user/create (POST)",
                "/api/user/profile (GET)",
                "/api/documents/upload (POST)",
                "/api/documents (GET)",
                "/api/documents/<id>/download (GET)",
                "/api/documents/<id>/view (GET)",
                "/api/documents/<id> (DELETE)",
                "/api/folders (POST, GET)",
                "/api/folders/<id> (PUT, DELETE)",
                "/api/analytics (GET)",
                "/api/admin/analytics (GET)",
                "/api/admin/users (GET)",
                "/api/admin/users/<uid>/role (PUT)",
                "/api/admin/documents (GET)",
                "/api/admin/documents/<id> (DELETE)"
            ]
        })

    # Serve Frontend UI when accessed via Flask server directly
    if frontend_dir.exists():
        @app.route("/app/<path:filename>")
        def serve_frontend_files(filename):
            return send_from_directory(str(frontend_dir), filename)

        @app.route("/app")
        def serve_frontend_index():
            return send_from_directory(str(frontend_dir), "index.html")

    # Error Handlers
    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "success": False,
            "error": "Not Found",
            "message": "The requested API endpoint does not exist."
        }), 404

    @app.errorhandler(413)
    def request_entity_too_large(error):
        return jsonify({
            "success": False,
            "error": "Payload Too Large",
            "message": f"Uploaded file exceeds maximum limit of {max_mb} MB."
        }), 413

    @app.errorhandler(500)
    def internal_server_error(error):
        return jsonify({
            "success": False,
            "error": "Internal Server Error",
            "message": "An unexpected server error occurred."
        }), 500

    return app

app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")
    print("\n" + "="*60)
    print(" [CloudVault] Backend API Server Starting...")
    print(f" Local Server URL: http://127.0.0.1:{port}")
    print(f" Firebase Status: {'LIVE' if firebase_config.is_firebase_initialized else 'STANDBY (Demo/Dev Mode)'}")
    print("="*60 + "\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
