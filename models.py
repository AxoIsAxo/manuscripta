# models.py
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import secrets
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class Document(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    # Public facing unique ID for the URL
    doc_id = db.Column(db.String(32), unique=True, nullable=False, default=lambda: secrets.token_urlsafe(16))
    content = db.Column(db.Text, default='')
    # Store hash, not the password itself
    password_hash = db.Column(db.String(128), nullable=True) # Nullable initially
    # True = requires password, False = public read-only
    is_private = db.Column(db.Boolean, default=True, nullable=False) # Default to private
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False # No password set means it can't be checked
        return check_password_hash(self.password_hash, password)

    def __repr__(self):
        return f'<Document {self.doc_id}>'