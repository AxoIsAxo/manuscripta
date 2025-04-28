# app.py
import os
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, abort, send_from_directory
from dotenv import load_dotenv
from models import db, Document
import secrets # For session secret key generation if not set

load_dotenv() # Load environment variables from .env file

app = Flask(__name__)

# --- Configuration ---
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///manuscripta.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(24))
app.config['SESSION_PERMANENT'] = False # Session cleared on browser close

# --- Initialization ---
db.init_app(app)

# --- Helper Functions ---
def check_doc_access(doc_id):
    """Checks if user has access to the document via session."""
    # print(f"Checking access for {doc_id}, session: {session.get(f'doc_{doc_id}_unlocked')}") # Debugging line
    return session.get(f'doc_{doc_id}_unlocked', False)

def get_document_or_404(doc_id):
    """Fetches a document by its public doc_id or returns 404."""
    doc = Document.query.filter_by(doc_id=doc_id).first()
    if not doc:
        abort(404, description="Document not found.")
    return doc

# --- Routes ---
@app.route('/')
def index():
    """Landing page."""
    return render_template('index.html')

@app.route('/favicon.ico')
def favicon():
    """Serves the favicon."""
    favicon_path = os.path.join(app.root_path, 'static', 'favicon.ico')
    if os.path.exists(favicon_path):
        return send_from_directory(os.path.join(app.root_path, 'static'),
                                   'favicon.ico', mimetype='image/vnd.microsoft.icon')
    else:
        abort(404) # Return 404 if no favicon exists


@app.route('/new', methods=['POST'])
def create_new_document():
    """Creates a new document entry."""
    new_doc = Document() # Defaults: is_private=True, password_hash=None, content=''
    db.session.add(new_doc)
    db.session.commit()
    # Grant temporary session access for the creator to set the initial password
    session[f'doc_{new_doc.doc_id}_unlocked'] = True
    return jsonify({'doc_id': new_doc.doc_id})

# --- Editor Route ---
@app.route('/write/<doc_id>')
def editor(doc_id):
    """Displays the editor, initial password setup, or password prompt."""
    doc = get_document_or_404(doc_id)
    has_session_access = check_doc_access(doc_id)

    read_only_status = True
    needs_password_set_status = False

    if doc.is_private:
        if has_session_access:
            if doc.password_hash is None:
                 needs_password_set_status = True
                 read_only_status = False # Allow editing to set password
            else:
                 read_only_status = False # Has access, password set
        else:
            # Private, no session access
            if doc.password_hash is not None:
                 # Needs password prompt
                 return render_template('password_prompt.html', doc_id=doc_id, is_private=True)
            else:
                 # Should not happen (no session access, but pwd not set yet) - treat as locked
                 return render_template('password_prompt.html', doc_id=doc_id, is_private=True)
    else:
        # Public document (implies password is set)
        needs_password_set_status = False
        if has_session_access:
            read_only_status = False # Public but unlocked -> editable
        else:
            read_only_status = True # Public, not unlocked -> read-only

    # Render the main editor template, passing necessary state
    # Content is now passed via a JS variable in head_extra for safe HTML insertion
    return render_template('editor.html',
                           doc=doc, # Pass doc object for checks like doc.password_hash in template
                           doc_id=doc_id,
                           read_only=read_only_status,
                           needs_password_set=needs_password_set_status)


# --- API Routes ---

@app.route('/api/check_password/<doc_id>', methods=['POST'])
def check_password_api(doc_id):
    """API endpoint to verify document password."""
    doc = get_document_or_404(doc_id)
    data = request.get_json()
    password = data.get('password')

    if not password:
        return jsonify({'success': False, 'error': 'Password required'}), 400

    if doc.check_password(password):
        session[f'doc_{doc_id}_unlocked'] = True # Grant session access
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': 'Incorrect password'}), 401

@app.route('/api/set_password/<doc_id>', methods=['POST'])
def set_password_api(doc_id):
    """API endpoint to set the initial password."""
    doc = get_document_or_404(doc_id)
    if not check_doc_access(doc_id): # Must have initial session access
         return jsonify({'success': False, 'error': 'Unauthorized'}), 403

    if doc.password_hash: # Prevent resetting via this route
         return jsonify({'success': False, 'error': 'Password already set'}), 400

    data = request.get_json()
    password = data.get('password')

    if not password or len(password) < 8:
        return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400

    doc.set_password(password)
    doc.is_private = True # Ensure it's private when password is first set
    db.session.commit()
    session[f'doc_{doc_id}_unlocked'] = True # Confirm access persists
    return jsonify({'success': True})


@app.route('/api/save/<doc_id>', methods=['POST'])
def save_document_api(doc_id):
    """API endpoint for saving document HTML content."""
    doc = get_document_or_404(doc_id)

    if not check_doc_access(doc_id): # CRITICAL check
        return jsonify({'success': False, 'error': 'Unauthorized - Access Denied'}), 403

    data = request.get_json()
    content = data.get('content') # This will now be HTML content

    if content is None:
        return jsonify({'success': False, 'error': 'Missing content'}), 400

    # Basic sanitization could be added here if needed, but trust contenteditable for now
    # For production, consider a library like Bleach to sanitize HTML
    doc.content = content
    db.session.commit()
    return jsonify({'success': True, 'message': 'Saved'})

@app.route('/api/set_privacy/<doc_id>', methods=['POST'])
def set_privacy_api(doc_id):
    """API endpoint to toggle document privacy."""
    doc = get_document_or_404(doc_id)

    if not check_doc_access(doc_id): # CRITICAL check
        return jsonify({'success': False, 'error': 'Unauthorized - Access Denied'}), 403

    if not doc.password_hash: # Must have password set first
         return jsonify({'success': False, 'error': 'Set a password before changing privacy'}), 400

    data = request.get_json()
    is_private = data.get('is_private')

    if is_private is None or not isinstance(is_private, bool):
        return jsonify({'success': False, 'error': 'Invalid privacy setting'}), 400

    doc.is_private = is_private
    db.session.commit()
    return jsonify({'success': True, 'is_private': doc.is_private})

# --- Error Handling ---
@app.errorhandler(404)
def page_not_found(e):
    error_desc = getattr(e, 'description', 'The requested URL was not found.')
    return render_template('404.html', error=error_desc), 404

@app.errorhandler(403)
def forbidden(e):
    error_desc = getattr(e, 'description', 'You do not have permission to access this resource.')
    return render_template('403.html', error=error_desc), 403

@app.errorhandler(500)
def internal_server_error(e):
    app.logger.error(f"Server Error: {e}", exc_info=True) # Log the real error
    return render_template('500.html', error="An internal server error occurred. We've been notified."), 500


# --- Create DB tables if they don't exist ---
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    app.run(host='0.0.0.0', port=port, debug=debug)