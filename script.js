class LessPassManager {
    constructor() {
        this.profiles = this.loadProfiles();
        this.currentProfile = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderProfiles();
        this.registerServiceWorker();
    }

    bindEvents() {
        // Кнопки управления
        document.getElementById('addProfile').addEventListener('click', () => this.showProfileModal());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportProfiles());
        document.getElementById('importBtn').addEventListener('click', () => this.importProfiles());
        document.getElementById('importFile').addEventListener('change', (e) => this.handleFileImport(e));

        // Формы
        document.getElementById('profileForm').addEventListener('submit', (e) => this.handleProfileSubmit(e));
        document.getElementById('masterPasswordForm').addEventListener('submit', (e) => this.handleMasterPasswordSubmit(e));

        // Модальные окна
        document.querySelectorAll('.close-btn').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModals());

        // Поиск
        document.getElementById('search').addEventListener('input', (e) => {
            this.renderProfiles(e.target.value);
        });

        // Клик вне модального окна
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModals();
            });
        });

        // Dropdown меню
        this.setupDropdown();
    }

    setupDropdown() {
        const dropdownToggle = document.querySelector('.dropdown-toggle');
        const dropdown = document.querySelector('.dropdown');
        
        if (dropdownToggle && dropdown) {
            dropdownToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            });

            // Закрываем dropdown при клике вне его
            document.addEventListener('click', () => {
                dropdown.classList.remove('active');
            });

            // Предотвращаем закрытие при клике внутри меню
            const dropdownMenu = document.querySelector('.dropdown-menu');
            if (dropdownMenu) {
                dropdownMenu.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
        }
    }

    // LessPass алгоритм
    async generatePassword(profile, masterPassword) {
        const salt = profile.site + profile.login + profile.counter;
        const key = await this.deriveKey(masterPassword, salt);
        const password = this.generatePasswordFromEntropy(key, profile);
        return password;
    }

    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );

        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            256
        );

        return new Uint8Array(derivedBits);
    }

    generatePasswordFromEntropy(entropy, profile) {
        const chars = this.getCharacterSet(profile);
        if (chars.length === 0) {
            throw new Error('Не выбран ни один набор символов');
        }
        
        let password = '';
        
        for (let i = 0; i < profile.length; i++) {
            const charIndex = entropy[i % entropy.length] % chars.length;
            password += chars[charIndex];
        }

        return password;
    }

    getCharacterSet(profile) {
        let chars = '';
        if (profile.lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
        if (profile.uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (profile.numbers) chars += '0123456789';
        if (profile.symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
        return chars;
    }

    // Управление профилями
    loadProfiles() {
        const stored = localStorage.getItem('lesspass-profiles');
        return stored ? JSON.parse(stored) : [];
    }

    saveProfiles() {
        localStorage.setItem('lesspass-profiles', JSON.stringify(this.profiles));
    }

    addProfile(profileData) {
        const profile = {
            id: Date.now().toString(),
            site: profileData.site.trim(),
            login: profileData.login.trim(),
            length: parseInt(profileData.length) || 16,
            counter: parseInt(profileData.counter) || 1,
            lowercase: profileData.lowercase,
            uppercase: profileData.uppercase,
            numbers: profileData.numbers,
            symbols: profileData.symbols,
            createdAt: new Date().toISOString()
        };

        // Валидация
        if (!profile.site || !profile.login) {
            this.showToast('Заполните название сервиса и логин', 'error');
            return;
        }

        this.profiles.push(profile);
        this.saveProfiles();
        this.renderProfiles();
        this.showToast('Профиль добавлен');
    }

    updateProfile(id, profileData) {
        const index = this.profiles.findIndex(p => p.id === id);
        if (index !== -1) {
            this.profiles[index] = {
                ...this.profiles[index],
                site: profileData.site.trim(),
                login: profileData.login.trim(),
                length: parseInt(profileData.length) || 16,
                counter: parseInt(profileData.counter) || 1,
                lowercase: profileData.lowercase,
                uppercase: profileData.uppercase,
                numbers: profileData.numbers,
                symbols: profileData.symbols
            };
            this.saveProfiles();
            this.renderProfiles();
            this.showToast('Профиль обновлен');
        }
    }

    deleteProfile(id) {
        if (confirm('Удалить этот профиль?')) {
            this.profiles = this.profiles.filter(p => p.id !== id);
            this.saveProfiles();
            this.renderProfiles();
            this.showToast('Профиль удален');
        }
    }

    // Рендер профилей
    renderProfiles(searchTerm = '') {
        const container = document.getElementById('profilesList');
        let filteredProfiles = this.profiles;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredProfiles = this.profiles.filter(profile =>
                profile.site.toLowerCase().includes(term) ||
                profile.login.toLowerCase().includes(term)
            );
        }

        // Сортировка по сайту и логину
        filteredProfiles.sort((a, b) => {
            const siteCompare = a.site.localeCompare(b.site);
            return siteCompare !== 0 ? siteCompare : a.login.localeCompare(b.login);
        });

        if (filteredProfiles.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>${searchTerm ? 'Профили не найдены' : 'Нет сохраненных профилей'}</h3>
                    <p>${searchTerm ? 'Попробуйте изменить поисковый запрос' : 'Добавьте первый профиль для генерации паролей'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredProfiles.map(profile => `
            <div class="profile-card">
                <div class="profile-header">
                    <div class="profile-title">${this.escapeHtml(profile.site)}</div>
                    <div class="profile-actions">
                        <button class="btn-icon" onclick="app.generatePasswordForProfile('${profile.id}')" title="Сгенерировать пароль">
                            🔑
                        </button>
                        <button class="btn-icon" onclick="app.editProfile('${profile.id}')" title="Редактировать">
                            ✏️
                        </button>
                        <button class="btn-icon" onclick="app.handleDeleteProfile('${profile.id}')" title="Удалить">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="profile-login">${this.escapeHtml(profile.login)}</div>
                <div class="profile-settings">
                    <span class="setting-tag">Длина: ${profile.length}</span>
                    <span class="setting-tag">Счётчик: ${profile.counter}</span>
                    ${profile.lowercase ? '<span class="setting-tag">abc</span>' : ''}
                    ${profile.uppercase ? '<span class="setting-tag">ABC</span>' : ''}
                    ${profile.numbers ? '<span class="setting-tag">123</span>' : ''}
                    ${profile.symbols ? '<span class="setting-tag">!@#</span>' : ''}
                </div>
            </div>
        `).join('');
    }

    // Модальные окна
    showProfileModal(profile = null) {
        this.currentProfile = profile;
        const modal = document.getElementById('profileModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('profileForm');

        if (profile) {
            title.textContent = 'Редактировать профиль';
            document.getElementById('site').value = profile.site;
            document.getElementById('login').value = profile.login;
            document.getElementById('length').value = profile.length;
            document.getElementById('counter').value = profile.counter;
            document.getElementById('lowercase').checked = profile.lowercase;
            document.getElementById('uppercase').checked = profile.uppercase;
            document.getElementById('numbers').checked = profile.numbers;
            document.getElementById('symbols').checked = profile.symbols;
        } else {
            title.textContent = 'Новый профиль';
            form.reset();
            document.getElementById('length').value = 16;
            document.getElementById('counter').value = 1;
            document.getElementById('lowercase').checked = true;
            document.getElementById('uppercase').checked = true;
            document.getElementById('numbers').checked = true;
            document.getElementById('symbols').checked = true;
        }

        modal.classList.add('active');
    }

    showMasterPasswordModal(profileId) {
        this.currentProfile = this.profiles.find(p => p.id === profileId);
        if (!this.currentProfile) {
            this.showToast('Профиль не найден', 'error');
            return;
        }
        const modal = document.getElementById('masterPasswordModal');
        modal.classList.add('active');
        document.getElementById('masterPassword').focus();
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        this.currentProfile = null;
        document.getElementById('masterPassword').value = '';
    }

    // Обработчики форм
    handleProfileSubmit(e) {
        e.preventDefault();
        
        const profileData = {
            site: document.getElementById('site').value,
            login: document.getElementById('login').value,
            length: document.getElementById('length').value,
            counter: document.getElementById('counter').value,
            lowercase: document.getElementById('lowercase').checked,
            uppercase: document.getElementById('uppercase').checked,
            numbers: document.getElementById('numbers').checked,
            symbols: document.getElementById('symbols').checked
        };

        // Проверка набора символов
        if (!profileData.lowercase && !profileData.uppercase && !profileData.numbers && !profileData.symbols) {
            this.showToast('Выберите хотя бы один набор символов', 'error');
            return;
        }

        if (this.currentProfile && this.currentProfile.id) {
            this.updateProfile(this.currentProfile.id, profileData);
        } else {
            this.addProfile(profileData);
        }

        this.closeModals();
    }

    async handleMasterPasswordSubmit(e) {
        e.preventDefault();
        const masterPassword = document.getElementById('masterPassword').value;
        
        if (!masterPassword) {
            this.showToast('Введите мастер-пароль', 'error');
            return;
        }

        try {
            const password = await this.generatePassword(this.currentProfile, masterPassword);
            await this.copyToClipboard(password);
            this.showToast('Пароль скопирован в буфер обмена');
            this.closeModals();
        } catch (error) {
            console.error('Error generating password:', error);
            this.showToast(error.message || 'Ошибка генерации пароля', 'error');
        }
    }

    // Вспомогательные методы
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Импорт/Экспорт
    exportProfiles() {
        const dataStr = JSON.stringify(this.profiles, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `lesspass-profiles-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        this.showToast('Профили экспортированы');
    }

    importProfiles() {
        document.getElementById('importFile').click();
    }

    handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedProfiles = JSON.parse(event.target.result);
                
                if (!Array.isArray(importedProfiles)) {
                    throw new Error('Invalid file format');
                }

                // Добавляем новые профили с новыми ID
                importedProfiles.forEach(profile => {
                    profile.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    this.profiles.push(profile);
                });

                this.saveProfiles();
                this.renderProfiles();
                this.showToast(`Импортировано ${importedProfiles.length} профилей`);
                
            } catch (error) {
                this.showToast('Ошибка импорта файла', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // Public methods for template
    generatePasswordForProfile(profileId) {
        this.showMasterPasswordModal(profileId);
    }

    editProfile(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (profile) {
            this.showProfileModal(profile);
        }
    }

    handleDeleteProfile(profileId) {
        this.deleteProfile(profileId);
    }

    // Service Worker для офлайн работы
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            const swCode = `
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open('lesspass-v1').then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './style.css',
                './script.js',
                './manifest.json'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
`;
            
            const blob = new Blob([swCode], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            
            navigator.serviceWorker.register(swUrl)
                .then(registration => {
                    console.log('SW registered: ', registration);
                })
                .catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
        }
    }
}

// Инициализация приложения
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new LessPassManager();
});
