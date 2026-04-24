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
    arrayUnion,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
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

    let tasks = [];
    let currentFilter = 'all';
    let unsubscribeTasks = null;
    let unsubscribeUser = null;
    let userStats = { currentStreak: 0, badges: [], lastActivityDate: "" };
    let badgeQueue = [];
    let isModalShowing = false;

    // --- Flatpickr ---
    const datePicker = flatpickr("#task-date", { dateFormat: "d-m-Y", placeholder: "Due Date", locale: "en", minDate: "today" });
    const timePicker = flatpickr("#task-time", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, placeholder: "Time", locale: "en" });

    // --- 30 Badge Definitions ---
    const badgeConfigs = [
        { id: 't1', name: 'First Steps', check: (t, u) => t.filter(x => x.completed).length >= 1 },
        { id: 't5', name: 'Productive', check: (t, u) => t.filter(x => x.completed).length >= 5 },
        { id: 't10', name: 'Busy Bee', check: (t, u) => t.filter(x => x.completed).length >= 10 },
        { id: 't20', name: 'Task Master', check: (t, u) => t.filter(x => x.completed).length >= 20 },
        { id: 't50', name: 'Overachiever', check: (t, u) => t.filter(x => x.completed).length >= 50 },
        { id: 'tl', name: 'Legend', check: (t, u) => t.filter(x => x.completed).length >= 100 },
        { id: 'tt', name: 'Titan', check: (t, u) => t.filter(x => x.completed).length >= 500 },
        { id: 'tg', name: 'Task God', check: (t, u) => t.filter(x => x.completed).length >= 1000 },
        
        { id: 's2', name: 'Nice Start', check: (t, u) => (u.currentStreak || 0) >= 2 },
        { id: 's3', name: 'Hattrick', check: (t, u) => (u.currentStreak || 0) >= 3 },
        { id: 's7', name: 'Warrior', check: (t, u) => (u.currentStreak || 0) >= 7 },
        { id: 's14', name: 'Fortnight', check: (t, u) => (u.currentStreak || 0) >= 14 },
        { id: 's21', name: 'Consistent', check: (t, u) => (u.currentStreak || 0) >= 21 },
        { id: 's30', name: 'Monthly Medal', check: (t, u) => (u.currentStreak || 0) >= 30 },
        { id: 's50', name: 'Half-Century', check: (t, u) => (u.currentStreak || 0) >= 50 },
        { id: 's100', name: 'Centurion', check: (t, u) => (u.currentStreak || 0) >= 100 },
        
        { id: 'f5', name: 'Focused', check: (t, u) => {
            const today = new Date().toISOString().split('T')[0];
            return t.filter(x => x.completed && x.createdAt?.toDate().toISOString().split('T')[0] === today).length >= 5;
        }},
        { id: 'f10', name: 'Unstoppable', check: (t, u) => {
            const today = new Date().toISOString().split('T')[0];
            return t.filter(x => x.completed && x.createdAt?.toDate().toISOString().split('T')[0] === today).length >= 10;
        }},
        { id: 'f20', name: 'Beast Mode', check: (t, u) => {
            const today = new Date().toISOString().split('T')[0];
            return t.filter(x => x.completed && x.createdAt?.toDate().toISOString().split('T')[0] === today).length >= 20;
        }},
        
        { id: 'eb', name: 'Early Bird', check: (t, u) => t.some(x => x.completed && x.createdAt?.toDate().getHours() < 8) },
        { id: 'no', name: 'Night Owl', check: (t, u) => t.some(x => x.completed && x.createdAt?.toDate().getHours() > 22) },
        { id: 'ex', name: 'Explorer', check: (t, u) => true },
        { id: 'cs', name: 'Clean Slate', check: (t, u) => t.length > 0 && t.every(x => x.completed) },
        { id: 'ar', name: 'Archivist', check: (t, u) => t.filter(x => x.completed).length >= 200 },
        { id: 'da', name: 'Deadline Ace', check: (t, u) => t.some(x => x.completed && x.datetime && new Date(x.datetime) < new Date(x.completedAt)) },
        { id: 'sh', name: 'Streak Hero', check: (t, u) => (u.currentStreak || 0) >= 10 },
        { id: 'pm', name: 'Pro Master', check: (t, u) => t.length >= 10 && (t.filter(x => x.completed).length / t.length) >= 0.9 },
        { id: 'fe', name: 'Feature Pro', check: (t, u) => localStorage.getItem('theme') !== null },
        { id: 'qu', name: 'Speed Demon', check: (t, u) => true },
        { id: 'lo', name: 'Loyalty', check: (t, u) => true },
        { id: 'nm', name: 'New Me', check: (t, u) => t.length >= 1 }
    ];

    // --- Global Theme Sync ---
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            body.classList.replace('light-mode', 'dark-mode');
            if (themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
        } else {
            body.classList.replace('dark-mode', 'light-mode');
            if (themeIcon) themeIcon.classList.replace('fa-sun', 'fa-moon');
        }
    };
    applyTheme(localStorage.getItem('theme'));

    // --- Streak Logic ---
    async function updateStreak() {
        if (!auth.currentUser) return;
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            const lastDate = data.lastActivityDate || "";
            let newStreak = data.currentStreak || 0;

            if (lastDate !== todayStr) {
                const last = new Date(lastDate);
                const diffTime = Math.abs(now - last);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) newStreak++;
                else if (diffDays > 1 || lastDate === "") newStreak = 1;
                
                await updateDoc(userRef, { currentStreak: newStreak, lastActivityDate: todayStr });
            }
        }
    }

    // --- Badge Modal ---
    function showBadgePopup(badge) {
        if (!document.getElementById('badge-modal')) {
            document.body.insertAdjacentHTML('beforeend', `<div id="badge-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index:9999; justify-content:center; align-items:center;"><div style="background:var(--card-bg); border:2px solid #f59e0b; padding:3rem; border-radius:30px; text-align:center; max-width:400px; width:90%; box-shadow:0 20px 50px rgba(245,158,11,0.4);"><div style="font-size:5rem; color:#f59e0b; margin-bottom:1.5rem;"><i class="fas fa-medal"></i></div><h2 id="modal-badge-name" style="font-size:1.8rem; margin-bottom:0.5rem;">Badge Unlocked!</h2><p id="modal-badge-desc" style="color:var(--text-secondary); margin-bottom:1.5rem;">Congratulations!</p><button id="close-badge-modal" style="width:100%; padding:1rem; background:var(--primary-gradient); color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer;">Awesome!</button></div></div>`);
            document.getElementById('close-badge-modal').onclick = () => { document.getElementById('badge-modal').style.display = 'none'; isModalShowing = false; processBadgeQueue(); };
        }
        badgeQueue.push(badge);
        processBadgeQueue();
    }

    function processBadgeQueue() {
        if (isModalShowing || badgeQueue.length === 0) return;
        isModalShowing = true;
        const badge = badgeQueue.shift();
        document.getElementById('modal-badge-name').innerText = badge.name;
        document.getElementById('badge-modal').style.display = 'flex';
        if (window.confetti) window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#f59e0b', '#6366f1', '#a855f7'], zIndex: 10001 });
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            subscribeToTasks(user.uid);
            subscribeToUserStats(user.uid);
        } else {
            if (unsubscribeTasks) unsubscribeTasks();
            if (unsubscribeUser) unsubscribeUser();
            tasks = [];
            renderTasks();
        }
    });

    if (logoutBtn) logoutBtn.onclick = (e) => { e.preventDefault(); handleLogout(); };

    function subscribeToUserStats(userId) {
        if (unsubscribeUser) unsubscribeUser();
        unsubscribeUser = onSnapshot(doc(db, "users", userId), (docSnap) => {
            if (docSnap.exists()) {
                userStats = docSnap.data();
                const greeting = document.getElementById('user-greeting');
                if (greeting && userStats.username) greeting.innerHTML = `Welcome, <span style="color: #a855f7;">${userStats.username}</span>! 👋`;
                checkAllBadges();
            }
        });
    }

    function subscribeToTasks(userId) {
        if (unsubscribeTasks) unsubscribeTasks();
        unsubscribeTasks = onSnapshot(collection(db, "users", userId, "tasks"), (snapshot) => {
            tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            tasks.sort((a, b) => (b.createdAt?.toDate ? b.createdAt.toDate() : new Date()) - (a.createdAt?.toDate ? a.createdAt.toDate() : new Date()));
            renderTasks();
            checkAllBadges();
        });
    }

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
        try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { badges: arrayUnion(badge.id) });
            showBadgePopup(badge);
        } catch (err) { console.error("Award Badge Error:", err); }
    }

    function renderTasks() {
        if (!taskList) return;
        taskList.innerHTML = '';
        const now = new Date();
        let filteredTasks = tasks;
        if (currentFilter === 'pending') filteredTasks = tasks.filter(t => !t.completed && (!t.datetime || new Date(t.datetime) > now));
        else if (currentFilter === 'overdue') filteredTasks = tasks.filter(t => !t.completed && t.datetime && new Date(t.datetime) <= now);
        else if (currentFilter === 'completed') filteredTasks = tasks.filter(t => t.completed);

        if (filteredTasks.length === 0) {
            taskList.innerHTML = `<div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 300px; text-align: center; opacity: 0.8;"><div style="width: 100px; height: 100px; background: rgba(99,102,241,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem;"><i class="fas fa-clipboard-list" style="font-size: 3rem; background: var(--primary-gradient); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;"></i></div><h3 style="font-size: 1.4rem; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 700;">All caught up!</h3><p style="font-size: 0.95rem; color: var(--text-secondary); max-width: 250px; margin:0 auto;">No tasks found.</p></div>`;
            return;
        }

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;
            const dt = task.datetime ? new Date(task.datetime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            li.innerHTML = `<div class="task-content" style="flex:1; min-width:0;"><div class="checkbox"><i class="fas fa-check"></i></div><div style="display:flex; flex-direction:column; min-width:0;"><span class="task-text">${task.text}</span><span style="font-size:0.7rem; color:var(--text-secondary);">${dt}</span></div></div><button class="delete-btn"><i class="fas fa-trash"></i></button>`;
            li.querySelector('.task-content').onclick = () => toggleTask(task.id, !task.completed);
            li.querySelector('.delete-btn').onclick = () => deleteTask(task.id);
            taskList.appendChild(li);
        });
    }

    async function addTask(text, date, time) {
        if (!auth.currentUser) return;
        let dt = "";
        if (date) { const p = date.includes("-") ? date.split("-") : date.split("/"); dt = `${p[2]}-${p[1]}-${p[0]}T${time || "00:00"}`; }
        await addDoc(collection(db, "users", auth.currentUser.uid, "tasks"), { text, datetime: dt, completed: false, createdAt: serverTimestamp() });
        const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
        if (allBtn) allBtn.click();
    }

    async function toggleTask(id, completedStatus) {
        try {
            const taskRef = doc(db, "users", auth.currentUser.uid, "tasks", id);
            await updateDoc(taskRef, { completed: completedStatus, completedAt: completedStatus ? serverTimestamp() : null });
            if (completedStatus) updateStreak();
        } catch (error) { console.error("Error updating task:", error); }
    }

    async function deleteTask(id) {
        const el = document.querySelector(`li[data-id="${id}"]`);
        if (el) {
            el.classList.add('removing');
            setTimeout(async () => { await deleteDoc(doc(db, "users", auth.currentUser.uid, "tasks", id)); }, 300);
        }
    }

    if (taskForm) {
        taskForm.onsubmit = (e) => {
            e.preventDefault();
            const text = taskInput.value.trim();
            if (text) {
                addTask(text, taskDate.value, taskTime.value);
                taskInput.value = '';
                if (datePicker) datePicker.clear();
                if (timePicker) timePicker.clear();
            }
        };
    }

    filterBtns.forEach(btn => {
        btn.onclick = () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            if (listTitle) listTitle.innerHTML = `<i class="fas fa-list-ul"></i> ${currentFilter === 'all' ? 'All Tasks' : currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1) + " Tasks"}`;
            renderTasks();
        };
    });

    if (themeToggle) {
        themeToggle.onclick = () => {
            const isLight = body.classList.contains('light-mode');
            applyTheme(isLight ? 'dark' : 'light');
            localStorage.setItem('theme', isLight ? 'dark' : 'light');
        };
    }
});
