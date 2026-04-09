// --- AUTHENTICATION GUARD ---
const path = window.location.pathname;
const isAuthPage = path.includes('login.html') || path.includes('signup.html');
const currentUser = localStorage.getItem('currentUser');

if (!currentUser && !isAuthPage) {
    // Force redirect to login if attempting to access core app without being logged in
    window.location.href = 'login.html';
} else if (currentUser && isAuthPage) {
    // If already logged in, skip auth pages and go straight to App
    window.location.href = 'index.html';
}
// ----------------------------

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskList = document.getElementById('task-list');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;
    const logoutBtn = document.getElementById('logout-btn');

    // Handle Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('currentUser');
            window.location.href = 'login.html';
        });
    }

    // State Variables
    let tasks = [];
    let currentFilter = 'all';

    // Initialize App
    function init() {
        // Load tasks from local storage
        const loadedTasks = localStorage.getItem('tasks');
        if (loadedTasks) {
            tasks = JSON.parse(loadedTasks);
        } else {
            // Generate some example content so screenshots can be taken easily
            tasks = [
                { id: 1, text: "Finish final project report", completed: false, datetime: "" },
                { id: 2, text: "Review advanced web development concepts", completed: true, datetime: "" },
                { id: 3, text: "Submit university assignment", completed: false, datetime: "2026-10-15T15:00" }
            ];
            saveTasks();
        }

        // Load Theme from local storage
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' && themeIcon) {
            body.classList.replace('light-mode', 'dark-mode');
            themeIcon.classList.replace('fa-moon', 'fa-sun');
        }

        renderTasks();
    }

    // Save tasks to local storage
    function saveTasks() {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    // Render tasks based on given filter
    function renderTasks() {
        taskList.innerHTML = '';
        
        const now = new Date();
        let filteredTasks = tasks;
        if (currentFilter === 'pending') {
            filteredTasks = tasks.filter(task => !task.completed && (!task.datetime || new Date(task.datetime) > now));
        } else if (currentFilter === 'overdue') {
            filteredTasks = tasks.filter(task => !task.completed && task.datetime && new Date(task.datetime) <= now);
        } else if (currentFilter === 'completed') {
            filteredTasks = tasks.filter(task => task.completed);
        }

        if (filteredTasks.length === 0) {
            const li = document.createElement('li');
            li.style.textAlign = 'center';
            li.style.color = 'var(--text-secondary)';
            li.style.padding = '1rem';
            li.textContent = "No tasks found.";
            taskList.appendChild(li);
            return;
        }

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;
            li.dataset.id = task.id;

            let dateHtml = '';
            if (task.datetime) {
                const dateObj = new Date(task.datetime);
                const isOverdue = !task.completed && dateObj <= new Date();
                const formattedDate = dateObj.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                
                const stylingClass = isOverdue ? 'task-date overdue-date' : 'task-date';
                const overdueText = isOverdue ? ' (Overdue)' : '';
                
                dateHtml = `<span class="${stylingClass}"><i class="far fa-clock"></i> ${formattedDate}${overdueText}</span>`;
            }

            li.innerHTML = `
                <div class="task-content" onclick="toggleTask(${task.id})">
                    <div class="checkbox">
                        <i class="fas fa-check"></i>
                    </div>
                    <span class="task-text">
                        ${escapeHTML(task.text)}
                        ${dateHtml}
                    </span>
                </div>
                <button class="delete-btn" aria-label="Delete Task" onclick="deleteTask(${task.id})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            taskList.appendChild(li);
        });
    }

    // Add new task
    function addTask(text, datetime) {
        const newTask = {
            id: Date.now(),
            text: text,
            datetime: datetime || "",
            completed: false
        };
        tasks.unshift(newTask);
        saveTasks();
        renderTasks();
    }

    // Toggle Task completion (attached to window to act globally from HTML onclick)
    window.toggleTask = function(id) {
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            saveTasks();
            renderTasks();
        }
    }

    // Delete Task
    window.deleteTask = function(id) {
        const taskElement = document.querySelector(`li[data-id="${id}"]`);
        
        // Add animation class
        if (taskElement) {
            taskElement.classList.add('removing');
            
            // Wait for animation to finish then actual delete
            setTimeout(() => {
                tasks = tasks.filter(t => t.id !== id);
                saveTasks();
                renderTasks();
            }, 300); // 300ms matches css animation duration
        } else {
            tasks = tasks.filter(t => t.id !== id);
            saveTasks();
            renderTasks();
        }
    }

    // Escape HTML to prevent XSS
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag])
        );
    }

    // Event Listeners
    if(taskForm) {
        taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = taskInput.value.trim();
            const datetimeInput = document.getElementById('task-datetime');
            const datetime = datetimeInput ? datetimeInput.value : "";
            
            if (text) {
                addTask(text, datetime);
                taskInput.value = '';
                if(datetimeInput) datetimeInput.value = '';
            }
        });
    }

    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            if (body.classList.contains('light-mode')) {
                body.classList.replace('light-mode', 'dark-mode');
                if(themeIcon) themeIcon.classList.replace('fa-moon', 'fa-sun');
                localStorage.setItem('theme', 'dark');
            } else {
                body.classList.replace('dark-mode', 'light-mode');
                if(themeIcon) themeIcon.classList.replace('fa-sun', 'fa-moon');
                localStorage.setItem('theme', 'light');
            }
        });
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state on buttons
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Set current filter and re-render
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    // Run initialization
    init();
});
