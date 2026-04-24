import { auth, db } from './firebase-config.js';
import { handleLogout } from './auth-handler.js';
import { 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    updateDoc, 
    doc, 
    deleteDoc, 
    serverTimestamp,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskDate = document.getElementById('task-date');
    const taskTime = document.getElementById('task-time');
    const taskList = document.getElementById('task-list');
    const listTitle = document.getElementById('list-title');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;
    const logoutBtn = document.getElementById('logout-btn');

    // State Variables
    let tasks = [];
    let currentFilter = 'all';
    let unsubscribeTasks = null;
    let unsubscribeUser = null;
    let userStats = { currentStreak: 0, badges: [] };
    let badgeQueue = [];
    let isModalShowing = false;

    // --- Flatpickr Initialization ---
    const datePicker = flatpickr("#task-date", {
        dateFormat: "d-m-Y",
        placeholder: "Due Date",
        locale: "en",
        minDate: "today",
        altInput: false
    });

    const timePicker = flatpickr("#task-time", {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true,
        placeholder: "Time",
        locale: "en",
        altInput: false
    });

    // --- Badge Definition ---
    const badgeConfigs = [
        { id: 't1', name: 'First Steps', check: (t, u) => t.filter(x => x.completed).length >= 1 },
        { id: 't5', name: 'Productive', check: (t, u) => t.filter(x => x.completed).length >= 5 },
        { id: 't10', name: 'Busy Bee', check: (t, u) => t.filter(x => x.completed).length >= 10 },
        { id: 't20', name: 'Task Master', check: (t, u) => t.filter(x => x.completed).length >= 20 },
        { id: 't50', name: 'Overachiever', check: (t, u) => t.filter(x => x.completed).length >= 50 },
        { id: 'tl', name: 'Task Legend', check: (t, u) => t.filter(x => x.completed).length >= 100 },
        { id: 's2', name: 'Nice Start', check: (t, u) => (u.currentStreak || 0) >= 2 },
        { id: 's3', name: 'Hattrick', check: (t, u) => (u.currentStreak || 0) >= 3 },
        { id: 's7', name: 'Weekly Warrior', check: (t, u) => (u.currentStreak || 0) >= 7 },
        { id: 's14', name: 'Fortnight', check: (t, u) => (u.currentStreak || 0) >= 14 },
        { id: 's30', name: 'Monthly Medal', check: (t, u) => (u.currentStreak || 0) >= 30 },
        { id: 'ex', name: 'Explorer', check: (t, u) => true }
    ];

    // --- Badge Modal Logic ---
    function injectBadgeModal() {
        if (document.getElementById('badge-modal')) return;
        const modalHtml = `
            <div id="badge-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index:9999; justify-content:center; align-items:center;">
                <div style="background:var(--card-bg); border:2px solid #f59e0b; padding:3rem; border-radius:30px; text-align:center; max-width:400px; width:90%; box-shadow:0 20px 50px rgba(245,158,11,0.4);">
                    <div style="font-size:5rem; color:#f59e0b; margin-bottom:1.5rem;"><i class="fas fa-medal"></i></div>
                    <h2 id="modal-badge-name" style="font-size:1.8rem; margin-bottom:0.5rem; color:var(--text-primary);">Badge Unlocked!</h2>
                    <p id="modal-badge-desc" style="color:var(--text-secondary); margin-bottom:1.5rem;">Congratulations!</p>
                    <button id="close-badge-modal" style="width:100%; padding:1rem; background:var(--primary-gradient); color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer;">Awesome!</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('close-badge-modal').onclick = () => {
            document.getElementById('badge-modal').style.display = 'none';
            isModalShowing = false;
            processBadgeQueue();
        };
    }

    function showBadgePopup(badge) {
        injectBadgeModal();
        badgeQueue.push(badge);
        processBadgeQueue();
    }

    function processBadgeQueue() {
        if (isModalShowing || badgeQueue.length === 0) return;
        isModalShowing = true;
        const badge = badgeQueue.shift();
        const modal = document.getElementById('badge-modal');
        document.getElementById('modal-badge-name').innerText = badge.name;
        modal.style.display = 'flex';
        if (window.confetti) {
            window.confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#f59e0b', '#6366f1', '#a855f7'],
                zIndex: 10001
            });
        }
    }

    // --- Firebase Auth & Subscription Logic ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            subscribeToTasks(user.uid);
            subscribeToUserStats(user.uid);
            setTimeout(() => checkBadge('ex'), 3000);
        } else {
            if (unsubscribeTasks) unsubscribeTasks();
            if (unsubscribeUser) unsubscribeUser();
            tasks = [];
            renderTasks();
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
        });
    }

    function subscribeToUserStats(userId) {
        if (unsubscribeUser) unsubscribeUser();
        unsubscribeUser = onSnapshot(doc(db, "users", userId), (docSnap) => {
            if (docSnap.exists()) {
                userStats = docSnap.data();
                const greetingElem = document.getElementById('user-greeting');
                if (greetingElem && userStats.username) {
                    greetingElem.innerHTML = `Welcome, <span style="color: #a855f7;">${userStats.username}</span>! 👋`;
                }
                checkAllBadges();
            }
        });
    }

    function subscribeToTasks(userId) {
        if (unsubscribeTasks) unsubscribeTasks();
        const q = collection(db, "users", userId, "tasks");
        unsubscribeTasks = onSnapshot(q, (snapshot) => {
            tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            tasks.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
                return dateB - dateA;
            });
            renderTasks();
            checkAllBadges();
        });
    }

    // --- Badge Awarding ---
    function checkAllBadges() {
        if (!auth.currentUser) return;
        badgeConfigs.forEach(config => {
            if (!userStats.badges?.includes(config.id)) {
                if (config.check(tasks, userStats)) awardBadge(config);
            }
        });
    }

    async function awardBadge(badge) {
        if (userStats.badges?.includes(badge.id)) return;
        userStats.badges = [...(userStats.badges || []), badge.id];
        try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                badges: arrayUnion(badge.id)
            });
            showBadgePopup(badge);
        } catch (err) { console.error("Award Badge Error:", err); }
    }

    async function checkBadge(id) {
        const badge = badgeConfigs.find(b => b.id === id);
        if (badge && !userStats.badges?.includes(id)) awardBadge(badge);
    }

    // --- Task Rendering & Logic ---
    function getRelativeTime(datetime) {
        if (!datetime) return null;
        const now = new Date();
        const d = new Date(datetime);
        const diff = d - now;
        const absDiff = Math.abs(diff);
        
        const minutes = Math.floor(absDiff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        let timeStr = "";
        if (days > 0) timeStr = `${days}d ${hours % 24}h`;
        else if (hours > 0) timeStr = `${hours}h ${minutes % 60}m`;
        else timeStr = `${minutes}m`;
        
        return { 
            text: diff < 0 ? `${timeStr} ago` : `in ${timeStr}`, 
            isOverdue: diff < 0 
        };
    }

    function renderTasks() {
        if (!taskList) return;
        taskList.innerHTML = '';
        const now = new Date();
        let filteredTasks = tasks;
        if (currentFilter === 'pending') filteredTasks = tasks.filter(task => !task.completed && (!task.datetime || new Date(task.datetime) > now));
        else if (currentFilter === 'overdue') filteredTasks = tasks.filter(task => !task.completed && task.datetime && new Date(task.datetime) <= now);
        else if (currentFilter === 'completed') filteredTasks = tasks.filter(task => task.completed);

        if (filteredTasks.length === 0) {
            taskList.innerHTML = `
                <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 300px; text-align: center; opacity: 0.8;">
                    <div style="width: 100px; height: 100px; background: rgba(99, 102, 241, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem;">
                        <i class="fas fa-clipboard-list" style="font-size: 3rem; background: var(--primary-gradient); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;"></i>
                    </div>
                    <h3 style="font-size: 1.4rem; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 700;">All caught up!</h3>
                    <p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 250px; margin: 0 auto;">No tasks found in this category.</p>
                </div>
            `;
            return;
        }

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            const relTime = getRelativeTime(task.datetime);
            const isTaskOverdue = !task.completed && relTime?.isOverdue;

            li.className = `task-item ${task.completed ? 'completed' : ''} ${isTaskOverdue ? 'overdue' : ''}`;
            li.dataset.id = task.id;
            
            let dateHtml = '';
            if (task.datetime) {
                const dateObj = new Date(task.datetime);
                const formattedDate = dateObj.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                const badgeClass = isTaskOverdue ? 'overdue' : 'upcoming';
                dateHtml = `
                    <div style="margin-top: 0.4rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; max-width: 100%;">
                        <span class="task-date ${isTaskOverdue ? 'overdue-date' : ''}" style="font-size: 0.75rem; max-width: 100%;">
                            <i class="far fa-calendar-alt"></i> ${formattedDate}
                        </span>
                        <span class="deadline-badge ${badgeClass}" style="max-width: 100%;">${relTime.text}</span>
                    </div>
                `;
            }

            li.innerHTML = `
                <div class="task-content" style="flex: 1; min-width: 0;">
                    <div class="checkbox"><i class="fas fa-check"></i></div>
                    <div style="display: flex; flex-direction: column; min-width: 0; max-width: 100%;">
                        <span class="task-text" style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;">${escapeHTML(task.text)}</span>
                        ${dateHtml}
                    </div>
                </div>
                <button class="delete-btn" aria-label="Delete Task"><i class="fas fa-trash"></i></button>
            `;
            li.querySelector('.task-content').onclick = () => toggleTask(task.id, !task.completed);
            li.querySelector('.delete-btn').onclick = () => deleteTask(task.id);
            taskList.appendChild(li);
        });
    }

    async function addTask(text, date, time) {
        if (!auth.currentUser) {
            console.error("No user logged in to add task");
            return;
        }
        try {
            console.log("Attempting to add task:", { text, date, time });
            let combinedDt = "";
            if (date) {
                // If date is in d-m-Y (Flatpickr format)
                if (date.includes("-")) {
                    const parts = date.split("-");
                    if (parts.length === 3) {
                        const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                        combinedDt = `${isoDate}T${time || "00:00"}`;
                    } else {
                        combinedDt = `${date}T${time || "00:00"}`;
                    }
                } else if (date.includes("/")) {
                     const parts = date.split("/");
                     if (parts.length === 3) {
                        const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                        combinedDt = `${isoDate}T${time || "00:00"}`;
                    }
                } else {
                    combinedDt = `${date}T${time || "00:00"}`;
                }
            }
            
            const tasksCol = collection(db, "users", auth.currentUser.uid, "tasks");
            const docRef = await addDoc(tasksCol, {
                text: text,
                datetime: combinedDt,
                completed: false,
                createdAt: serverTimestamp()
            });
            console.log("Task added successfully with ID:", docRef.id);
            
            // Switch to All Tasks automatically so user sees the new task
            if (currentFilter !== 'all') {
                const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
                if (allBtn) allBtn.click();
            }
        } catch (error) { 
            console.error("Error adding task to Firebase:", error);
            alert("Failed to add task. Please check your internet connection.");
        }
    }

    async function toggleTask(id, completedStatus) {
        try {
            const taskRef = doc(db, "users", auth.currentUser.uid, "tasks", id);
            await updateDoc(taskRef, { completed: completedStatus });
        } catch (error) { console.error("Error updating task:", error); }
    }

    async function deleteTask(id) {
        const taskElement = document.querySelector(`li[data-id="${id}"]`);
        if (taskElement) {
            taskElement.classList.add('removing');
            setTimeout(async () => {
                try { 
                    const taskRef = doc(db, "users", auth.currentUser.uid, "tasks", id);
                    await deleteDoc(taskRef); 
                } catch (error) { console.error("Error deleting task:", error); }
            }, 300);
        } else {
            try { 
                const taskRef = doc(db, "users", auth.currentUser.uid, "tasks", id);
                await deleteDoc(taskRef); 
            } catch (error) { console.error("Error deleting task:", error); }
        }
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));
    }

    // --- Event Listeners ---
    if(taskForm) {
        taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = taskInput.value.trim();
            const date = taskDate.value;
            const time = taskTime.value;
            if (text) {
                addTask(text, date, time);
                taskInput.value = '';
                if (datePicker) datePicker.clear();
                if (timePicker) timePicker.clear();
            }
        });
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            
            // Update List Title
            if (listTitle) {
                const icon = currentFilter === 'all' ? 'fa-list-ul' : 
                             currentFilter === 'pending' ? 'fa-clock' : 
                             currentFilter === 'overdue' ? 'fa-exclamation-circle' : 'fa-check-circle';
                const titleText = currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1) + " Tasks";
                listTitle.innerHTML = `<i class="fas ${icon}"></i> ${currentFilter === 'all' ? 'All Tasks' : titleText}`;
            }
            
            renderTasks();
        });
    });

    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isLight = body.classList.contains('light-mode');
            body.classList.replace(isLight ? 'light-mode' : 'dark-mode', isLight ? 'dark-mode' : 'light-mode');
            if(themeIcon) themeIcon.classList.replace(isLight ? 'fa-moon' : 'fa-sun', isLight ? 'fa-sun' : 'fa-moon');
            localStorage.setItem('theme', isLight ? 'dark' : 'light');
        });
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' && themeIcon) {
        body.classList.replace('light-mode', 'dark-mode');
        themeIcon.classList.replace('fa-moon', 'fa-sun');
    }
});
