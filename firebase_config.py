import firebase_admin
from firebase_admin import credentials, firestore, storage

cred = credentials.Certificate("serviceAccountKey.json")

firebase_admin.initialize_app(cred, {
    "storageBucket": "CloudVault.appspot.com"
})

db = firestore.client()
bucket = storage.bucket()