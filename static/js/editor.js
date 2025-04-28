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

    // Helper to apply inline style TO SELECTION using Range API (corrected version)
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
                alert("Could not apply style to the current selection. It might be too complex (e.g., across paragraphs). Try selecting simpler text.");
                return; // Stop if failed
            }
        } else {
             // ** REMOVING STYLE (Default/Reset selected) **
             // Use 'removeFormat' as a blunt tool for now.
             // It removes B, I, U, Strikethrough, and potentially font/color/size depending on browser.
             document.execCommand('removeFormat', false, null);
             // Attempt to remove specific inline style attribute as well (might help sometimes)
             document.execCommand('styleWithCSS', false, true); // Ensure execCommand uses style attributes
             // The following might not work reliably across browsers for specific properties.
             // document.execCommand('fontName', false, ''); // Attempt to reset font family
             // document.execCommand('fontSize', false, ''); // Attempt to reset font size (often uses numbers 1-7)
             document.execCommand('styleWithCSS', false, false); // Reset back if needed

             console.warn("Resetting style uses 'removeFormat', which might remove multiple styles.");
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

             if (!response.ok) {
                 if (response.status === 403) {
                    if (saveStatus) saveStatus.textContent = 'Error: Access denied.';
                    alert("Session expired. Please copy work & refresh.");
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
                    editorToolbar.querySelectorAll('button, select').forEach(el => el.disabled = false); // Enable toolbar

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

    // Settings Panel Logic (Verified Fix)
    // console.log("Settings Button Element:", settingsBtn); // Debugging
    // console.log("Settings Panel Element:", settingsPanel); // Debugging

    if (settingsBtn && settingsPanel) { // Ensure both elements exist
        settingsBtn.addEventListener('click', (e) => {
            // console.log("Settings button clicked!"); // Debugging
            e.stopPropagation(); // Prevent click propagating to document
            const isHidden = settingsPanel.style.display === 'none' || settingsPanel.style.display === '';
            settingsPanel.style.display = isHidden ? 'block' : 'none';
            // console.log("Settings panel display set to:", settingsPanel.style.display); // Debugging
        });

        if (closeSettingsBtn) {
             closeSettingsBtn.addEventListener('click', () => {
                 // console.log("Close settings button clicked!"); // Debugging
                 settingsPanel.style.display = 'none';
             });
        } else {
             // console.warn("Close settings button not found!"); // Debugging
        }

         // Close if clicking outside the panel and button
         document.addEventListener('click', (event) => {
             if (settingsPanel.style.display === 'block') { // Only act if panel is open
                 if (!settingsPanel.contains(event.target) && !settingsBtn.contains(event.target)) {
                     // console.log("Clicked outside settings panel, closing."); // Debugging
                     settingsPanel.style.display = 'none';
                 }
             }
         });

    } else {
        if(!settingsBtn) console.error("Settings button element not found!");
        if(!settingsPanel) console.error("Settings panel element not found!");
    }


    // Privacy Toggle Logic
    if (privacyToggle) {
        privacyToggle.addEventListener('change', async () => {
            const is_private = privacyToggle.checked;
            if(privacyError) privacyError.textContent = '';
            privacyToggle.disabled = true; // Disable while processing
            try {
                const response = await fetch(`/api/set_privacy/${window.DOC_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_private: is_private }) });
                const data = await response.json();
                if (!response.ok) {
                    privacyToggle.checked = !is_private; // Revert UI
                    if (response.status === 400 && data.error && data.error.includes('Set a password')) { if (privacyError) privacyError.textContent = "Set a password first."; }
                    else if (response.status === 403) { if (privacyError) privacyError.textContent = "Error: Access Denied."; alert("Session expired."); }
                    else { if (privacyError) privacyError.textContent = data.error || 'Failed to update privacy.'; }
                } else {
                    window.IS_PRIVATE = data.is_private;
                    if (saveStatus) saveStatus.textContent = `Privacy set to ${data.is_private ? 'Private' : 'Public'}`;
                }
            } catch (error) {
                console.error("Error setting privacy:", error);
                if (privacyError) privacyError.textContent = 'A network error occurred.';
                privacyToggle.checked = !is_private;
            } finally {
                 // Re-enable only if password is set
                 const hasPassword = !window.NEEDS_PASSWORD_SET;
                 privacyToggle.disabled = !hasPassword;
            }
        });
    }


    // Copy URL Buttons
    copyUrlBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                const originalText = btn.dataset.originalText || btn.textContent;
                btn.dataset.originalText = originalText;
                btn.textContent = 'Copied!';
                btn.disabled = true;
                setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1500);
            }).catch(err => { console.error('Failed to copy URL: ', err); alert('Failed to copy URL automatically.'); });
        });
    });

    // Unlock Editing in Public Mode
    if (unlockEditBtn && unlockPromptSection) {
        unlockEditBtn.addEventListener('click', () => {
            unlockPromptSection.style.display = 'block';
            unlockEditBtn.style.display = 'none';
            if(unlockPasswordInput) unlockPasswordInput.focus();
        });
    }
    if (cancelUnlockBtn && unlockPromptSection) {
         cancelUnlockBtn.addEventListener('click', () => {
            unlockPromptSection.style.display = 'none';
            if (unlockEditBtn) unlockEditBtn.style.display = 'inline-block';
            if(unlockErrorMessage) unlockErrorMessage.textContent = '';
            if(unlockPasswordInput) unlockPasswordInput.value = '';
        });
    }
    if (unlockPasswordForm) {
        unlockPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = unlockPasswordInput.value;
            if (unlockErrorMessage) unlockErrorMessage.textContent = '';
            const submitButton = e.target.querySelector('button[type="submit"]');
            if(submitButton) submitButton.disabled = true;
             try {
                const response = await fetch(`/api/check_password/${window.DOC_ID}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password }) });
                const data = await response.json();
                if (response.ok && data.success) { window.location.reload(); }
                else { if (unlockErrorMessage) unlockErrorMessage.textContent = data.error || 'Incorrect password.'; if(unlockPasswordInput) { unlockPasswordInput.focus(); unlockPasswordInput.select(); } }
            } catch (error) { console.error('Error checking password:', error); if (unlockErrorMessage) unlockErrorMessage.textContent = 'An error occurred.'; }
            finally { if(submitButton) submitButton.disabled = false; }
        });
    }

    // --- Toolbar Event Listeners ---
    if (fontFamilySelect && editorContent) {
        fontFamilySelect.addEventListener('change', (event) => {
             applyStyleToSelection('fontFamily', event.target.value);
        });
    }
    if (fontSizeSelect && editorContent) {
        fontSizeSelect.addEventListener('change', (event) => {
             applyStyleToSelection('fontSize', event.target.value);
        });
    }
    if (formatBoldBtn) {
        formatBoldBtn.addEventListener('click', (e) => { e.preventDefault(); applyExecCommand('bold'); });
    }
    if (formatItalicBtn) {
        formatItalicBtn.addEventListener('click', (e) => { e.preventDefault(); applyExecCommand('italic'); });
    }

    // Keyboard shortcuts
    if (editorContent) {
        editorContent.addEventListener('keydown', (event) => {
             if (editorContent.getAttribute('contenteditable') !== 'true') return;
            if (event.ctrlKey || event.metaKey) {
                let handled = false;
                 // Ctrl+S for save
                 if (event.key === 's' || event.key === 'S') {
                    saveDocument(); handled = true; if(saveStatus) saveStatus.textContent = 'Saving...';
                 }
                if (handled) { event.preventDefault(); }
            }
        });
    }

     // Hide/disable toolbar if needed on initial load
     if (editorToolbar && (window.IS_READ_ONLY || window.NEEDS_PASSWORD_SET)) {
         editorToolbar.style.display = 'none';
     }

}); // End DOMContentLoaded