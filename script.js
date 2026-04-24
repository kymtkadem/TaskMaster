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

import { initTheme } from './theme-handler.js';

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
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
    let awardedBadgesSession = new Set();
    let badgeQueue = [];
    let isModalShowing = false;

    // --- 30 Badge Definitions (Challenging & Unique) ---
    const badgeConfigs = [
        // Task Milestone (8)
        { id: 't5', name: 'First Steps', desc: 'Complete 5 tasks', check: (t, u) => t.filter(x => x.completed).length >= 5 },
        { id: 't25', name: 'Productive', desc: 'Complete 25 tasks', check: (t, u) => t.filter(x => x.completed).length >= 25 },
        { id: 't50', name: 'Busy Bee', desc: 'Complete 50 tasks', check: (t, u) => t.filter(x => x.completed).length >= 50 },
        { id: 't100', name: 'Task Master', desc: 'Complete 100 tasks', check: (t, u) => t.filter(x => x.completed).length >= 100 },
        { id: 't250', name: 'Elite', desc: 'Complete 250 tasks', check: (t, u) => t.filter(x => x.completed).length >= 250 },
        { id: 'tl', name: 'Legend', desc: 'Complete 500 tasks', check: (t, u) => t.filter(x => x.completed).length >= 500 },
        { id: 'tt', name: 'Titan', desc: 'Complete 1000 tasks', check: (t, u) => t.filter(x => x.completed).length >= 1000 },
        { id: 'tg', name: 'God Mode', desc: 'Complete 2500 tasks', check: (t, u) => t.filter(x => x.completed).length >= 2500 },
        
        // Streak Milestone (8)
        { id: 's3', name: 'Nice Start', desc: '3 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 3 },
        { id: 's7', name: 'Warrior', desc: '7 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 7 },
        { id: 's14', name: 'Fortnight', desc: '14 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 14 },
        { id: 's21', name: 'Consistent', desc: '21 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 21 },
        { id: 's30', name: 'Monthly', desc: '30 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 30 },
        { id: 's50', name: 'Veteran', desc: '50 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 50 },
        { id: 's100', name: 'Centurion', desc: '100 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 100 },
        { id: 's365', name: 'Immortal', desc: '365 Day Streak', check: (t, u) => (u.currentStreak || 0) >= 365 },
        
        // Performance (7)
        { id: 'f10', name: 'Focused', desc: '10 tasks in one day', check: (t, u) => {
            const today = new Date().toISOString().split('T')[0];
            return t.filter(x => x.completed && x.completedAt?.toDate().toISOString().split('T')[0] === today).length >= 10;
        }},
        { id: 'f25', name: 'Beast Mode', desc: '25 tasks in one day', check: (t, u) => {
            const today = new Date().toISOString().split('T')[0];
            return t.filter(x => x.completed && x.completedAt?.toDate().toISOString().split('T')[0] === today).length >= 25;
        }},
        { id: 'eb', name: 'Early Bird', desc: '50 tasks before 8AM', check: (t, u) => t.filter(x => x.completed && x.completedAt?.toDate().getHours() < 8).length >= 50 },
        { id: 'no', name: 'Night Owl', desc: '50 tasks after 10PM', check: (t, u) => t.filter(x => x.completed && x.completedAt?.toDate().getHours() >= 22).length >= 50 },
        { id: 'da', name: 'Deadline Ace', desc: '100 tasks on time', check: (t, u) => t.filter(x => x.completed && x.datetime && new Date(x.datetime) >= x.completedAt?.toDate()).length >= 100 },
        { id: 'pm', name: 'Pro Master', desc: '98% success rate (min 100 tasks)', check: (t, u) => t.length >= 100 && (t.filter(x => x.completed).length / t.length) >= 0.98 },
        { id: 'qu', name: 'Speed Demon', desc: 'Complete 10 tasks within 5 mins of creation', check: (t, u) => t.filter(x => x.completed && x.createdAt && (x.completedAt.toDate() - x.createdAt.toDate()) < 300000).length >= 10 },

        // Special (7)
        { id: 'cs', name: 'Clean Slate', desc: 'Zero pending tasks (min 50)', check: (t, u) => t.length >= 50 && t.every(x => x.completed) },
        { id: 'lo', name: 'Loyalty', desc: 'Account age 6 months', check: (t, u) => u.createdAt && (new Date() - u.createdAt.toDate()) > (180 * 24 * 60 * 60 * 1000) },
        { id: 'nm', name: 'New Me', desc: 'Complete first 10 tasks', check: (t, u) => t.filter(x => x.completed).length >= 10 },
        { id: 'ex', name: 'Explorer', desc: 'Visit Progress 50 times', check: (t, u) => (u.progressVisits || 0) >= 50 },
        { id: 'sh', name: 'Social Star', desc: 'Share 10 times', check: (t, u) => (u.shares || 0) >= 10 },
        { id: 'ar', name: 'Archivist', desc: 'Archive 500 tasks', check: (t, u) => t.filter(x => x.completed).length >= 500 },
        { id: 'ha', name: 'Hard Worker', desc: '15 tasks on a weekend day', check: (t, u) => {
            const today = new Date();
            const isWeekend = today.getDay() === 0 || today.getDay() === 6;
            if (!isWeekend) return false;
            const todayStr = today.toISOString().split('T')[0];
            return t.filter(x => x.completed && x.completedAt?.toDate().toISOString().split('T')[0] === todayStr).length >= 15;
        }}
    ];

    // --- Badge Modal ---
    function showBadgePopup(badge) {
        if (!document.getElementById('badge-modal')) {
            document.body.insertAdjacentHTML('beforeend', `
                <div id="badge-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(10px); z-index:9999; justify-content:center; align-items:center;">
                    <div style="background:var(--card-bg); border:2px solid #f59e0b; padding:3rem; border-radius:30px; text-align:center; max-width:400px; width:90%; box-shadow:0 20px 50px rgba(245,158,11,0.4);">
                        <div style="font-size:5rem; color:#f59e0b; margin-bottom:1.5rem;"><i class="fas fa-medal"></i></div>
                        <h2 id="modal-badge-name" style="font-size:1.8rem; margin-bottom:0.5rem; color:var(--text-primary);">Badge Unlocked!</h2>
                        <p id="modal-badge-desc" style="color:var(--text-secondary); margin-bottom:1.5rem;">Congratulations!</p>
                        <button id="close-badge-modal" style="width:100%; padding:1rem; background:var(--primary-gradient); color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer; transition:all 0.3s ease;">Awesome!</button>
                    </div>
                </div>
            `);
            document.getElementById('close-badge-modal').onclick = () => {
                document.getElementById('badge-modal').style.display = 'none';
                isModalShowing = false;
                // Give it a tiny delay to prevent instant re-triggering
                setTimeout(processBadgeQueue, 100);
            };
        }
        
        // Prevent adding the same badge multiple times to the queue in a single session
        if (!badgeQueue.find(b => b.id === badge.id)) {
            badgeQueue.push(badge);
            processBadgeQueue();
        }
    }

    function processBadgeQueue() {
        if (isModalShowing || badgeQueue.length === 0) return;
        isModalShowing = true;
        const badge = badgeQueue.shift();
        document.getElementById('modal-badge-name').innerText = badge.name;
        document.getElementById('modal-badge-desc').innerText = badge.desc || "Achievement Unlocked!";
        document.getElementById('badge-modal').style.display = 'flex';
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

    function checkAllBadges() {
        if (!auth.currentUser || !userStats.badges) return;
        badgeConfigs.forEach(config => {
            if (!userStats.badges.includes(config.id) && !awardedBadgesSession.has(config.id)) {
                if (config.check(tasks, userStats)) {
                    awardBadge(config);
                }
            }
        });
    }

    async function awardBadge(badge) {
        if (awardedBadgesSession.has(badge.id)) return;
        awardedBadgesSession.add(badge.id); // Mark as awarded in this session immediately
        
        try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), { 
                badges: arrayUnion(badge.id) 
            });
            showBadgePopup(badge);
        } catch (err) { 
            console.error("Award Badge Error:", err);
            awardedBadgesSession.delete(badge.id); // Rollback on error
        }
    }

    function getRelativeTime(datetime) {
        if (!datetime) return "";
        const now = new Date();
        const due = new Date(datetime);
        const diff = due - now;
        const isOverdue = diff < 0;
        const absDiff = Math.abs(diff);

        const hours = Math.floor(absDiff / (1000 * 60 * 60));
        const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
        const days = Math.floor(hours / 24);

        let timeStr = "";
        if (days > 0) timeStr = `${days}d ${hours % 24}h`;
        else if (hours > 0) timeStr = `${hours}h ${minutes}m`;
        else timeStr = `${minutes}m`;

        return {
            text: isOverdue ? `Overdue by ${timeStr}` : `${timeStr} left`,
            isOverdue: isOverdue
        };
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
            taskList.innerHTML = `
                <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 1rem; text-align: center;">
                    <div style="width: 120px; height: 120px; background: rgba(168, 85, 247, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 2rem; box-shadow: 0 15px 35px rgba(168, 85, 247, 0.1);">
                        <i class="fas fa-clipboard-check" style="font-size: 4rem; color: #a855f7;"></i>
                    </div>
                    <h3 style="font-size: 1.8rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.5rem; font-family: 'Outfit', sans-serif;">All Caught Up!</h3>
                    <p style="color: var(--text-secondary); font-size: 1.1rem; max-width: 300px; line-height: 1.6;">You've completed all your tasks. Time to relax or take on a new challenge!</p>
                </div>
            `;
            return;
        }

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;
            li.setAttribute('data-id', task.id);
            
            const relative = getRelativeTime(task.datetime);
            const dtFormatted = task.datetime ? new Date(task.datetime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            
            li.innerHTML = `
                <div class="task-content" style="flex:1; min-width:0;">
                    <div class="checkbox">
                        <i class="fas fa-check"></i>
                    </div>
                    <div style="display:flex; flex-direction:column; min-width:0;">
                        <span class="task-text">${task.text}</span>
                        <div style="display:flex; gap:0.8rem; align-items:center;">
                            <span style="font-size:0.7rem; color:var(--text-secondary);">${dtFormatted}</span>
                            ${relative ? `<span class="task-date ${relative.isOverdue && !task.completed ? 'overdue-date' : ''}" style="font-size:0.7rem;">${relative.text}</span>` : ''}
                        </div>
                    </div>
                </div>
                <button class="delete-btn">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            li.querySelector('.task-content').onclick = () => toggleTask(task.id, !task.completed);
            li.querySelector('.delete-btn').onclick = (e) => {
                e.stopPropagation();
                deleteTask(task.id);
            };
            taskList.appendChild(li);
        });
    }

    async function addTask(text, date, time) {
        if (!auth.currentUser) return;
        let dt = "";
        if (date) { 
            // Handle both DD-MM-YYYY and YYYY-MM-DD
            const p = date.includes("-") ? date.split("-") : date.split("/"); 
            if (p[0].length === 4) {
                // YYYY-MM-DD
                dt = `${p[0]}-${p[1]}-${p[2]}T${time || "00:00"}`;
            } else {
                // DD-MM-YYYY
                dt = `${p[2]}-${p[1]}-${p[0]}T${time || "00:00"}`;
            }
        }
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
            setTimeout(async () => { 
                await deleteDoc(doc(db, "users", auth.currentUser.uid, "tasks", id)); 
            }, 300);
        } else {
            await deleteDoc(doc(db, "users", auth.currentUser.uid, "tasks", id));
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


    function subscribeToUserStats(userId) {
        if (unsubscribeUser) unsubscribeUser();
        unsubscribeUser = onSnapshot(doc(db, "users", userId), (docSnap) => {
            if (docSnap.exists()) {
                userStats = docSnap.data();
                const greeting = document.getElementById('user-greeting');
                if (greeting) {
                    const name = userStats.username || "Task Master";
                    greeting.innerHTML = `Welcome, <span style="color: #a855f7; font-weight: 800;">${name}</span>! <span style="opacity: 0.6; font-size: 0.9rem; font-weight: 400; margin-left: 10px;">• Stay organized and focus on what matters.</span>`;
                }
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

    filterBtns.forEach(btn => {
        btn.onclick = () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            if (listTitle) listTitle.innerHTML = `<i class="fas fa-list-ul"></i> ${currentFilter === 'all' ? 'All Tasks' : currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1) + " Tasks"}`;
            renderTasks();
        };
    });
});
