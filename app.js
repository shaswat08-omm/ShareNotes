// ==========================================
// Supabase Client Initialization
// ==========================================
const supabaseUrl = "https://agqvbqwchsmfgoyklrcl.supabase.co";
const supabaseKey = "sb_publishable_IpDkbnGsGxzpMOoGxaLW3A_UOlBgRF1";
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let userSavedNoteIds = []; // Cache of saved note IDs for the current user

// ==========================================
// Initialize App
// ==========================================
async function initApp() {
    // Auth Session setup — try to refresh the session first
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    
    // If we have a session but it might be stale, force a refresh
    if (session) {
        const { data: refreshData, error: refreshError } = await supabaseClient.auth.refreshSession();
        if (refreshError) {
            console.warn('Session refresh failed:', refreshError.message);
            // Session is invalid, sign out cleanly
            await supabaseClient.auth.signOut();
            currentUser = null;
        } else {
            currentUser = refreshData.session?.user || null;
        }
    } else {
        currentUser = null;
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateAuthUI();
    });

    // Load user's saved note IDs for bookmark display
    if (currentUser) {
        const { data } = await supabaseClient
            .from('saved_notes')
            .select('note_id')
            .eq('user_id', currentUser.id);
        userSavedNoteIds = data ? data.map(row => row.note_id) : [];
    }

    updateAuthUI();
    setupHamburger();
}

// Helper: Ensure session is fresh before write operations
async function ensureFreshSession() {
    const { data, error } = await supabaseClient.auth.refreshSession();
    if (error) {
        alert("Your session has expired. Please log in again.");
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return false;
    }
    currentUser = data.session?.user || null;
    return true;
}

// ==========================================
// Auth UI Handling
// ==========================================
function updateAuthUI() {
    const isLoggedIn = currentUser !== null;
    const authBtn = document.getElementById('authBtn');
    
    if (authBtn) {
        if (isLoggedIn) {
            authBtn.textContent = 'Logout';
            authBtn.href = '#';
            authBtn.onclick = async (e) => {
                e.preventDefault();
                await supabaseClient.auth.signOut();
                window.location.reload();
            };
        } else {
            authBtn.textContent = 'Login';
            authBtn.href = 'login.html';
            authBtn.onclick = null;
        }
    }
}

// ==========================================
// Hamburger Menu Toggle
// ==========================================
function setupHamburger() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
}

// ==========================================
// Helper: Fetch all notes from Supabase
// ==========================================
async function fetchAllNotes() {
    // Intentionally exclude file_url — it stores huge base64/URL data not needed for card display
    const { data, error } = await supabaseClient
        .from('notes')
        .select('id, title, description, author_id, date')
        .order('date', { ascending: false });
    if (error) {
        console.error('Error fetching notes:', error.message);
        return [];
    }
    return data || [];
}

// ==========================================
// Helper: Fetch a single note by ID
// ==========================================
async function fetchNoteById(noteId) {
    // Only fetch metadata (no file_url) — used for edit/delete operations on cards
    const { data, error } = await supabaseClient
        .from('notes')
        .select('id, title, description, author_id, date')
        .eq('id', noteId)
        .single();
    if (error) {
        console.error('Error fetching note:', error.message);
        return null;
    }
    return data;
}

// ==========================================
// Render Function for Note Cards
// ==========================================
function createNoteCard(note, pageContext = 'home') {
    const isSaved = userSavedNoteIds.includes(note.id);
    
    const card = document.createElement('div');
    card.className = 'note-card';
    
    // Bookmark logic (for home page)
    let bookmarkIconClass = isSaved ? 'fas fa-bookmark saved' : 'far fa-bookmark';
    let bookmarkTitle = isSaved ? 'Remove from Library' : 'Save to Library';
    
    // Actions header mapping depending on page context
    let actionButtons = '';
    
    if (pageContext === 'uploads') {
        actionButtons = `
            <div class="note-actions">
                <button class="btn-icon" title="Edit Note" onclick="editNote('${note.id}')"><i class="fas fa-edit"></i></button>
                <button class="btn-icon" style="color: #e53e3e;" title="Permanently Delete Note" onclick="deleteNote('${note.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
    } else if (pageContext === 'library') {
        actionButtons = `
            <div class="note-actions">
                <button class="btn-icon" style="color: #e53e3e;" title="Remove from My Library" onclick="removeLibraryNote('${note.id}', this)"><i class="fas fa-minus-circle"></i></button>
            </div>
        `;
    }

    // Bookmark button is only shown on home page
    let footerBookmarkBtn = '';
    if (pageContext === 'home') {
        footerBookmarkBtn = `
            <button class="btn-icon ${isSaved ? 'saved' : ''}" title="${bookmarkTitle}" onclick="toggleSaveNote('${note.id}', this)">
                <i class="${bookmarkIconClass}"></i>
            </button>
        `;
    }

    const noteDate = note.date ? new Date(note.date).toLocaleDateString() : 'Unknown';
    
    card.innerHTML = `
        <div class="pdf-thumbnail">
            <i class="fas fa-file-pdf"></i>
            <span class="pdf-badge">PDF</span>
        </div>
        <div class="note-header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <h3 class="note-title">${note.title}</h3>
                ${actionButtons}
            </div>
            <div class="note-meta">
                <span><i class="fas fa-user-circle"></i> Shared Note</span>
                <span>${noteDate}</span>
            </div>
        </div>
        <div class="note-body">
            <p class="note-desc">${note.description || ''}</p>
        </div>
        <div class="note-footer">
            <button class="btn btn-outline" onclick="window.location.href='view.html?id=${note.id}'">View Notes</button>
            ${footerBookmarkBtn}
        </div>
    `;
    return card;
}

// ==========================================
// Edit Note Logic (Supabase)
// ==========================================
window.editNote = async function(noteId) {
    const note = await fetchNoteById(noteId);
    if (!note) {
        alert("Note not found.");
        return;
    }
    
    const newTitle = prompt("Edit Note Title:", note.title);
    if (newTitle === null) return;
    
    const newDesc = prompt("Edit Note Description:", note.description);
    if (newDesc === null) return;
    
    if (newTitle.trim() === '' || newDesc.trim() === '') {
        alert("Title and description cannot be empty.");
        return;
    }
    
    const { error } = await supabaseClient
        .from('notes')
        .update({ title: newTitle, description: newDesc })
        .eq('id', noteId);
    
    if (error) {
        alert("Failed to update note: " + error.message);
        return;
    }
    
    alert("Note updated successfully!");
    window.location.reload();
};

// ==========================================
// Permanently Delete Note (From My Uploads)
// ==========================================
window.deleteNote = async function(noteId) {
    if (!confirm("Are you sure you want to permanently delete this material? It will be removed from the site. This action cannot be undone.")) {
        return;
    }
    
    const { error } = await supabaseClient
        .from('notes')
        .delete()
        .eq('id', noteId);
    
    if (error) {
        alert("Failed to delete note: " + error.message);
        return;
    }
    
    window.location.reload();
};

// ==========================================
// Remove from Personal Library Only (Supabase)
// ==========================================
window.removeLibraryNote = async function(noteId, btnElement) {
    if (!confirm("Remove this note from your personal library?")) {
        return;
    }
    
    const { error } = await supabaseClient
        .from('saved_notes')
        .delete()
        .match({ user_id: currentUser.id, note_id: noteId });
    
    if (error) {
        alert("Failed to remove note: " + error.message);
        return;
    }
    
    // Remove the card immediately from DOM
    const card = btnElement.closest('.note-card');
    if (card) {
        card.remove();
        checkEmptyLibrary();
    }
};

// ==========================================
// Toggle Save to Library (Home Page - Supabase)
// ==========================================
window.toggleSaveNote = async function(noteId, btnElement) {
    if (!currentUser) {
        alert("Please login to save notes to your library.");
        window.location.href = 'login.html';
        return;
    }

    const isSaved = userSavedNoteIds.includes(noteId);
    
    if (isSaved) {
        // Remove from saved_notes
        const { error } = await supabaseClient
            .from('saved_notes')
            .delete()
            .match({ user_id: currentUser.id, note_id: noteId });
        
        if (error) {
            alert("Error removing note: " + error.message);
            return;
        }
        
        userSavedNoteIds = userSavedNoteIds.filter(id => id !== noteId);
        btnElement.classList.remove('saved');
        btnElement.querySelector('i').classList.replace('fas', 'far');
        btnElement.querySelector('i').classList.remove('saved');
        btnElement.title = "Save to Library";
    } else {
        // Add to saved_notes
        const { error } = await supabaseClient
            .from('saved_notes')
            .insert({ user_id: currentUser.id, note_id: noteId });
        
        if (error) {
            alert("Error saving note: " + error.message);
            return;
        }
        
        userSavedNoteIds.push(noteId);
        btnElement.classList.add('saved');
        btnElement.querySelector('i').classList.replace('far', 'fas');
        btnElement.querySelector('i').classList.add('saved');
        btnElement.title = "Remove from Library";
    }
};

// ==========================================
// Empty Library Check
// ==========================================
function checkEmptyLibrary() {
    const container = document.getElementById('libraryNotesContainer');
    if (container && container.children.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>Your library is empty.</h3><p>Go to the home page to explore and save study materials!</p></div>';
        container.style.display = 'block';
    }
}

// ==========================================
// Page Load Event Handlers
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    await initApp();
    
    // ---- HOMEPAGE ----
    const homeContainer = document.getElementById('homepageNotesContainer');
    if (homeContainer) {
        const notes = await fetchAllNotes();
        if (notes.length === 0) {
            homeContainer.innerHTML = '<div class="empty-state">No notes available yet. Be the first to upload!</div>';
        } else {
            notes.forEach(note => {
                homeContainer.appendChild(createNoteCard(note, 'home'));
            });
        }
        
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        
        const filterNotes = () => {
            const query = searchInput.value.toLowerCase();
            homeContainer.innerHTML = '';
            
            const filtered = notes.filter(n => 
                n.title.toLowerCase().includes(query) || 
                (n.description && n.description.toLowerCase().includes(query))
            );
            
            if (filtered.length === 0) {
                homeContainer.innerHTML = '<div class="empty-state">No matching notes found.</div>';
                homeContainer.style.display = 'block';
            } else {
                homeContainer.style.display = 'grid';
                filtered.forEach(note => homeContainer.appendChild(createNoteCard(note, 'home')));
            }
        };
        
        if (searchBtn) searchBtn.addEventListener('click', filterNotes);
        if (searchInput) searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') filterNotes();
        });
    }

    // ---- LIBRARY PAGE ----
    const libraryContainer = document.getElementById('libraryNotesContainer');
    if (libraryContainer) {
        if (!currentUser) {
            libraryContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Please Login</h3>
                    <p>You need to be logged in to view your library.</p>
                    <a href="login.html" class="btn btn-primary" style="margin-top: 1rem;">Go to Login</a>
                </div>
            `;
            libraryContainer.style.display = 'block';
            return;
        }

        // Fetch saved note IDs for this user, then fetch the actual notes
        const { data: savedRows, error: savedError } = await supabaseClient
            .from('saved_notes')
            .select('note_id')
            .eq('user_id', currentUser.id);
        
        if (savedError) {
            console.error('Error fetching library:', savedError.message);
        }

        const savedIds = savedRows ? savedRows.map(r => r.note_id) : [];
        
        if (savedIds.length === 0) {
            checkEmptyLibrary();
        } else {
            const { data: savedNotes } = await supabaseClient
                .from('notes')
                .select('id, title, description, author_id, date')
                .in('id', savedIds)
                .order('date', { ascending: false });
            
            if (!savedNotes || savedNotes.length === 0) {
                checkEmptyLibrary();
            } else {
                savedNotes.forEach(note => {
                    libraryContainer.appendChild(createNoteCard(note, 'library'));
                });
            }
        }
    }
    
    // ---- MY UPLOADS PAGE ----
    const uploadsContainer = document.getElementById('myUploadsContainer');
    if (uploadsContainer) {
        if (!currentUser) {
            uploadsContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Please Login</h3>
                    <p>You need to be logged in to view your uploads.</p>
                    <a href="login.html" class="btn btn-primary" style="margin-top: 1rem;">Go to Login</a>
                </div>
            `;
            uploadsContainer.style.display = 'block';
            return;
        }

        const { data: myNotes, error: myError } = await supabaseClient
            .from('notes')
            .select('id, title, description, author_id, date')
            .eq('author_id', currentUser.id)
            .order('date', { ascending: false });
        
        if (myError) {
            console.error('Error fetching uploads:', myError.message);
        }
        
        if (!myNotes || myNotes.length === 0) {
            uploadsContainer.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <h3>You haven't uploaded anything yet.</h3>
                    <p>Share your knowledge and help the community!</p>
                    <a href="upload.html" class="btn btn-primary" style="margin-top: 1rem;">Upload Now</a>
                </div>
            `;
            uploadsContainer.style.display = 'block';
        } else {
            myNotes.forEach(note => {
                uploadsContainer.appendChild(createNoteCard(note, 'uploads'));
            });
        }
    }
    
    // ---- UPLOAD FORM ----
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        if (!currentUser) {
            alert("Please login to upload study materials.");
            window.location.href = 'login.html';
            return;
        }
        
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('noteTitle').value;
            const desc = document.getElementById('noteDesc').value;
            const fileInput = document.getElementById('noteFile');
            
            if (!fileInput.files.length) {
                alert("Please select a file to upload.");
                return;
            }
            
            const file = fileInput.files[0];

            const submitBtn = uploadForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Uploading...';
            submitBtn.disabled = true;

            try {
                // Refresh token before write operation
                const sessionOk = await ensureFreshSession();
                if (!sessionOk) return;

                // Upload file to Supabase Storage (instead of storing base64 in DB)
                const fileExt = file.name.split('.').pop();
                const filePath = `${currentUser.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

                const { data: storageData, error: storageError } = await supabaseClient
                    .storage
                    .from('note-files')
                    .upload(filePath, file, { upsert: false });

                if (storageError) {
                    alert("Failed to upload file: " + storageError.message);
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                    return;
                }

                // Get the public URL for the uploaded file
                const { data: urlData } = supabaseClient
                    .storage
                    .from('note-files')
                    .getPublicUrl(storageData.path);

                const publicUrl = urlData.publicUrl;

                // Save note metadata + storage URL to the database
                const { error: dbError } = await supabaseClient
                    .from('notes')
                    .insert([{
                        title: title,
                        description: desc,
                        author_id: currentUser.id,
                        file_url: publicUrl
                    }]);
                
                if (dbError) {
                    alert("Failed to save note: " + dbError.message);
                    submitBtn.textContent = originalText;
                    submitBtn.disabled = false;
                } else {
                    alert("Note uploaded successfully!");
                    window.location.href = 'index.html';
                }
            } catch (err) {
                alert("Unexpected error: " + err.message);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // ---- AUTH PAGE ----
    const authForm = document.getElementById('authForm');
    if (authForm) {
        if (currentUser) {
            window.location.href = 'index.html';
        }

        const modeInput = document.getElementById('authMode');
        const toggleBtn = document.getElementById('toggleAuthModeBtn');
        const nameGroup = document.getElementById('nameGroup');
        const submitBtn = document.getElementById('authSubmitBtn');
        const toggleText = document.getElementById('authToggleText');
        const errorMsg = document.getElementById('authErrorMsg');

        const performToggle = (e) => {
            e.preventDefault();
            errorMsg.style.display = 'none';
            if (modeInput.value === 'login') {
                modeInput.value = 'signup';
                nameGroup.style.display = 'block';
                document.getElementById('fullName').required = true;
                submitBtn.textContent = 'Sign Up';
                toggleText.innerHTML = "Already have an account? <a href='#' id='toggleAuthModeBtnInner' style='color: var(--primary-color); font-weight: 500;'>Sign in</a>";
                document.getElementById('toggleAuthModeBtnInner').addEventListener('click', performToggle);
            } else {
                modeInput.value = 'login';
                nameGroup.style.display = 'none';
                document.getElementById('fullName').required = false;
                submitBtn.textContent = 'Sign In';
                toggleText.innerHTML = "Don't have an account? <a href='#' id='toggleAuthModeBtnInner' style='color: var(--primary-color); font-weight: 500;'>Sign up</a>";
                document.getElementById('toggleAuthModeBtnInner').addEventListener('click', performToggle);
            }
        };

        if (toggleBtn) {
            toggleBtn.addEventListener('click', performToggle);
        }

        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            errorMsg.style.display = 'none';
            const originalBtnText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (modeInput.value === 'signup') {
                const fullName = document.getElementById('fullName').value;
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: fullName } }
                });
                
                if (error) {
                    errorMsg.textContent = error.message;
                    errorMsg.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                } else {
                    if (data.session) {
                        window.location.href = 'index.html';
                    } else {
                        alert("Sign up successful! You can now log in.");
                        modeInput.value = 'signup';
                        performToggle(new Event('click'));
                        submitBtn.disabled = false;
                        document.getElementById('password').value = '';
                    }
                }
            } else {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });
                if (error) {
                    errorMsg.textContent = error.message;
                    errorMsg.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                } else {
                    window.location.href = 'index.html';
                }
            }
        });
    }
});
