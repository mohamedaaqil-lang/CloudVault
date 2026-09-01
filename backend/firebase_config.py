"""
Firebase Configuration and Initialization Module for CloudVault.
Handles Firebase Admin SDK authentication, Firestore database, and Cloud Storage bucket.
"""

import os
import json
import logging
from pathlib import Path
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore, storage, auth

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("CloudVault-Firebase")

# Load environment variables
backend_dir = Path(__file__).resolve().parent
env_path = backend_dir / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

# Global instances
db = None
bucket = None
firebase_app = None
is_firebase_initialized = False

def initialize_firebase():
    """
    Initializes Firebase Admin SDK using Service Account JSON file or environment variable.
    """
    global db, bucket, firebase_app, is_firebase_initialized

    if is_firebase_initialized and firebase_app is not None:
        return db, bucket

    service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT", "serviceAccountKey.json")
    service_account_json_str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    storage_bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "cloudvault-demo.appspot.com")

    # Resolve relative path against backend directory
    if not os.path.isabs(service_account_path):
        candidate_paths = [
            backend_dir / service_account_path,
            Path.cwd() / service_account_path,
            Path.cwd() / "backend" / service_account_path
        ]
        resolved_path = None
        for p in candidate_paths:
            if p.exists():
                resolved_path = str(p)
                break
        if resolved_path:
            service_account_path = resolved_path

    cred = None

    try:
        if service_account_json_str:
            # Parse from JSON string (helpful for cloud hosting like Render/Heroku)
            cred_dict = json.loads(service_account_json_str)
            cred = credentials.Certificate(cred_dict)
            logger.info("Using Firebase credentials from FIREBASE_SERVICE_ACCOUNT_JSON environment variable.")
        elif os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            logger.info(f"Loaded Firebase service account credentials from {service_account_path}")
        else:
            logger.warning(
                f"Service account file '{service_account_path}' not found.\n"
                "To connect to live Firebase:\n"
                "1. Download your service account key JSON from Firebase Console -> Project Settings -> Service Accounts\n"
                "2. Save it as 'backend/serviceAccountKey.json' or set FIREBASE_SERVICE_ACCOUNT in your .env file."
            )
            # Try default application credentials as fallback
            try:
                cred = credentials.ApplicationDefault()
                logger.info("Using Application Default Credentials for Firebase.")
            except Exception:
                cred = None

        if cred:
            if not firebase_admin._apps:
                firebase_app = firebase_admin.initialize_app(cred, {
                    "storageBucket": storage_bucket_name
                })
            else:
                firebase_app = firebase_admin.get_app()

            db = firestore.client()
            bucket = storage.bucket()
            is_firebase_initialized = True
            logger.info(f"Firebase initialized successfully! Storage Bucket: {storage_bucket_name}")
        else:
            logger.warning("Running in Standby Mode: Firebase credentials not supplied.")
            is_firebase_initialized = False

    except Exception as e:
        logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
        is_firebase_initialized = False

    return db, bucket

# Trigger initialization on module import
initialize_firebase()
