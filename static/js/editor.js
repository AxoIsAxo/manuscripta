// static/js/editor.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    const editorContent = document.getElementById('editor-content'); // The DIV
    const saveStatus = document.getElementById('save-status');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const privacyToggle = document.getElementById('privacy-toggle');
    const privacyError = document.getElementById('privacy-error');
    const setPasswordSection = document.getElementById('set-password-section');
    const setPasswordForm = document.getElementById('set-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const setPasswordError = document.getElementById('set-password-error');
    const copyUrlBtns = document.querySelectorAll('#copy-url-btn, #copy-url-btn-2, #copy-url-btn-3');
    const unlockEditBtn = document.getElementById('unlock-edit-btn');
    const unlockPromptSection = document.getElementById('unlock-prompt-section');
    const unlockPasswordForm = document.getElementById('unlock-password-form');
    const unlockPasswordInput = document.getElementById('unlock-password');
    const unlockErrorMessage = document.getElementById('unlock-error-message');
    const cancelUnlockBtn = document.getElementById('cancel-unlock-btn');
    const editorToolbar = document.querySelector('.editor-toolbar');
    const fontFamilySelect = document.getElementById('font-family-select');
    const fontSizeSelect = document.getElementById('font-size-select');
    const formatBoldBtn = document.getElementById('format-bold-btn');
    const formatItalicBtn = document.getElementById('format-italic-btn');

    // --- State & Timers ---
    let saveTimeout;
    const SAVE_DELAY = 1800; // ms delay after typing stops
    let isSaving = false; // Prevent concurrent saves

    // --- Helper Functions ---

    // Helper to apply style using execCommand (for B/I)
    const applyExecCommand = (command) => {
        if (!editorContent || editorContent.getAttribute('contenteditable') !== 'true') return;
        document.execCommand(command, false, null);
        editorContent.focus(); // Re-focus the editor
        triggerSave(); // Content potentially changed
    };

    // Helper to apply inline style TO SELECTION using Range API
    const applyStyleToSelection = (styleProperty, styleValue) => {
        if (!editorContent || editorContent.getAttribute('contenteditable') !== 'true') return;

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
             console.warn("No selection to apply style.");
             return; // No selection available
        }

        const range = selection.getRangeAt(0);
        if (range.collapsed && styleValue) {
             console.warn("Please select text to apply style.");
             return; // Require selection for applying new style
        }

        // --- Applying or Removing Style ---
        if (styleValue) {
            // ** APPLYING STYLE **
            // Create a new span element
            const span = document.createElement('span');
            span.style[styleProperty] = styleValue; // Apply the desired style

            try {
                // Use extract/delete/insert for more robustness than surroundContents
                const selectedContent = range.extractContents(); // Extract nodes
                span.appendChild(selectedContent); // Wrap extracted nodes in the span
                range.deleteContents(); // Delete the original selection range
                range.insertNode(span); // Insert the new styled span

                // Restore selection around the new span
                selection.removeAllRanges();
                const newRange = document.createRange();
                newRange.selectNode(span); // Select the entire span
                selection.addRange(newRange);

            } catch (e) {
                console.error("Error applying style:", e);
                alert("Could not apply style to the current selection. It might be too complex.");
                return; // Stop if failed
            }
        } else {
             // ** REMOVING STYLE (Default/Reset selected) **
             // This is more complex. `removeFormat` is blunt. A better way
             // involves finding the relevant parent span and removing the specific style.
             // Let's try a combination: removeFormat first, then attempt cleanup.
             document.execCommand('removeFormat', false, null); // Remove B, I, etc.

             // More targeted removal (attempt):
             // Find nodes within the range and remove the specific style property
             // This requires traversing nodes and is complex to do correctly for all cases.
             // Simple version: Use removeFormat for now. User might need to reapply other styles.
             console.warn("Resetting style uses 'removeFormat', which might remove other styles too.");

             // ---- More Advanced Removal (Conceptual) ----
             // const commonAncestor = range.commonAncestorContainer;
             // const nodes = []; // Get all nodes within the range
             // nodes.forEach(node => {
             //    if (node.nodeType === Node.ELEMENT_NODE && node.style[styleProperty]) {
             //       node.style[styleProperty] = null; // Remove specific style
             //       // If span becomes empty of styles, potentially unwrap it
             //       if (!node.getAttribute('style')) { /* unwrap logic */ }
             //    } else if (node.nodeType === Node.ELEMENT_NODE && node.parentNode.style[styleProperty]) {
             //         // Need to potentially split parent node, very complex
             //    }
             // });
        }


        editorContent.focus();
        triggerSave(); // HTML content changed
    };


    // Trigger debounced save
    const triggerSave = () => {
        if (editorContent.getAttribute('contenteditable') !== 'true') return; // Check editability
        if (saveStatus) saveStatus.textContent = 'Changes detected...';
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveDocument, SAVE_DELAY);
    }

    // --- Core Save Functionality ---
    const saveDocument = async () => {
        if (editorContent.getAttribute('contenteditable') !== 'true' || isSaving) return;

        isSaving = true;
        if (saveStatus) saveStatus.textContent = 'Saving...';

        // Get HTML content from the div
        const contentToSave = editorContent.innerHTML;

        try {
            const response = await fetch(`/api/save/${window.DOC_ID}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: contentToSave }) // Send HTML
            });

             // ... (keep existing response handling logic) ...
             if (!response.ok) {
                 if (response.status === 403) {
                    if (saveStatus) saveStatus.textContent = 'Error: Access denied.';
                    alert("Your editing session might have expired. Please copy any unsaved work and refresh the page.");
                 } else {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`Save failed: ${response.status} ${errorData.error || ''}`);
                 }
            } else {
                const data = await response.json();
                if (data.success) {
                    if (saveStatus) saveStatus.textContent = `Saved ${new Date().toLocaleTimeString()}`;
                } else {
                    if (saveStatus) saveStatus.textContent = 'Error saving';
                    console.error('Save failed:', data.message);
                }
            }
        } catch (error) {
            if (saveStatus) saveStatus.textContent = 'Connection error';
            console.error('Error saving document:', error);
        } finally {
             isSaving = false;
        }
    };

    // --- Initial Setup & Event Listeners ---

    // Load Initial Content into the Div
    if (editorContent && window.INITIAL_CONTENT !== undefined) {
        // Set content regardless of initial editability
        editorContent.innerHTML = window.INITIAL_CONTENT;
        // Ensure correct editable state based on server render
        editorContent.setAttribute('contenteditable', (window.IS_READ_ONLY || window.NEEDS_PASSWORD_SET) ? 'false' : 'true');
    } else if (editorContent && window.IS_READ_ONLY) {
        // Handle case where content might be empty but should be read-only
        editorContent.setAttribute('contenteditable', 'false');
    }


    // Setup input listener if editable
    const setupInputListener = () => {
        if (editorContent && editorContent.getAttribute('contenteditable') === 'true') {
            editorContent.removeEventListener('input', triggerSave); // Remove previous if any
            editorContent.addEventListener('input', triggerSave);
            if (saveStatus) {
                if (!saveStatus.textContent || saveStatus.textContent === 'Set password to enable saving') {
                    saveStatus.textContent = 'Saved';
                }
            }
        } else {
             if (editorContent) editorContent.removeEventListener('input', triggerSave);
        }
    };

    setupInputListener(); // Call setup initially

    // Update status message based on initial state
    if (editorContent) {
        if (window.IS_READ_ONLY) {
             if (saveStatus) saveStatus.textContent = 'Read-only';
        } else if (window.NEEDS_PASSWORD_SET) {
             if (saveStatus) saveStatus.textContent = 'Set password to enable saving';
        } else if (editorContent.getAttribute('contenteditable') === 'true') {
             if (!saveStatus.textContent) saveStatus.textContent = 'Saved';
        }
    }


    // Initial Password Setting
    if (setPasswordForm) {
        setPasswordForm.addEventListener('submit', async (e) => {
            // ... (keep existing logic - it correctly enables contenteditable and the toolbar) ...
             e.preventDefault();
            const password = newPasswordInput ? newPasswordInput.value : '';
            if (setPasswordError) setPasswordError.textContent = '';
            if (!password || password.length < 8) {
                if (setPasswordError) setPasswordError.textContent = 'Password must be at least 8 characters.'; return;
            }
            setPasswordForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
            try {
                const response = await fetch(`/api/set_password/${window.DOC_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password }) });
                const data = await response.json();
                 if (response.ok && data.success) {
                    if (setPasswordSection) setPasswordSection.style.display = 'none';
                    if (editorContent) editorContent.setAttribute('contenteditable', 'true');
                    if (editorToolbar) editorToolbar.style.display = 'flex';
                    editorToolbar.querySelectorAll('button, select').forEach(el => el.disabled = false);

                    window.NEEDS_PASSWORD_SET = false;
                    window.IS_PRIVATE = true;
                    if (privacyToggle) { privacyToggle.checked = true; privacyToggle.disabled = false; }
                    if (saveStatus) saveStatus.textContent = 'Password set. Auto-save enabled.';
                    setupInputListener(); // Setup listener now
                    editorContent.focus();
                } else {
                    if (setPasswordError) setPasswordError.textContent = data.error || 'Failed to set password.';
                }
            } catch (error) {
                console.error("Error setting password:", error);
                if (setPasswordError) setPasswordError.textContent = 'An network error occurred.';
            } finally {
                 if(setPasswordForm) setPasswordForm.querySelectorAll('input, button').forEach(el => el.disabled = false);
            }
        });
    }

    // Settings Panel Logic (remains the same)
    if (settingsBtn && settingsPanel && closeSettingsBtn) { /* ... keep logic ... */ }
    if (privacyToggle) {
        privacyToggle.addEventListener('change', async () => { /* ... keep logic ... */ });
    }
    // Copy URL Buttons (remains the same)
    copyUrlBtns.forEach(btn => {
        btn.addEventListener('click', (e) => { /* ... keep logic ... */ });
    });
    // Unlock Editing in Public Mode (remains the same)
    if (unlockEditBtn && unlockPromptSection) { /* ... keep logic ... */ }
    if (cancelUnlockBtn && unlockPromptSection) { /* ... keep logic ... */ }
    if (unlockPasswordForm) {
        unlockPasswordForm.addEventListener('submit', async (e) => { /* ... keep logic ... */ });
    }

    // --- Toolbar Event Listeners ---
    if (fontFamilySelect && editorContent) {
        fontFamilySelect.addEventListener('change', (event) => {
             // Apply style TO SELECTION
             applyStyleToSelection('fontFamily', event.target.value);
             // Optionally reset select back to a default/placeholder value
             // event.target.selectedIndex = 0;
        });
    }

    if (fontSizeSelect && editorContent) {
        fontSizeSelect.addEventListener('change', (event) => {
             // Apply style TO SELECTION
             applyStyleToSelection('fontSize', event.target.value);
             // Optionally reset select back to a default/placeholder value
             // event.target.selectedIndex = 0;
        });
    }

    // Bold/Italic still use execCommand on selection
    if (formatBoldBtn) {
        formatBoldBtn.addEventListener('click', (e) => {
            e.preventDefault();
            applyExecCommand('bold');
        });
    }

    if (formatItalicBtn) {
        formatItalicBtn.addEventListener('click', (e) => {
            e.preventDefault();
            applyExecCommand('italic');
        });
    }

    // Keyboard shortcuts
    if (editorContent) {
        editorContent.addEventListener('keydown', (event) => {
             if (editorContent.getAttribute('contenteditable') !== 'true') return;
            if (event.ctrlKey || event.metaKey) {
                let handled = false;
                 // Browser default B/I is fine with execCommand usually
                 if (event.key === 's' || event.key === 'S') {
                    saveDocument(); // Manual save
                    handled = true;
                    if(saveStatus) saveStatus.textContent = 'Saving...';
                 }
                if (handled) {
                    event.preventDefault();
                }
            }
        });
    }

     // Hide/disable toolbar if needed on initial load
     if (editorToolbar && (window.IS_READ_ONLY || window.NEEDS_PASSWORD_SET)) {
         editorToolbar.style.display = 'none';
     }

}); // End DOMContentLoaded