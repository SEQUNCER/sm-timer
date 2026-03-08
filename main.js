/**
 * SM-Timer Main Logic
 * ===================
 * Основная логика синхронизированного таймера
 */

// Глобальный ID комнаты (одна комната для всех)
const GLOBAL_ROOM_ID = '00000000-0000-0000-0000-000000000001';

document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация Supabase
    const supabase = window.SM_Timer.supabase;
    const { TIMER_MODE, TIMER_STATUS, formatTime } = window.SM_Timer;
    
    // Состояние приложения
    let currentRoom = null;
    let localTimerInterval = null;
    let isUpdating = false;
    
    // DOM элементы
    const elements = {
        statusIndicator: document.getElementById('statusIndicator'),
        statusText: document.getElementById('statusText'),
        timerDisplay: document.getElementById('timerDisplay'),
        timerSubtext: document.getElementById('timerSubtext'),
        modeCountdown: document.getElementById('modeCountdown'),
        modeStopwatch: document.getElementById('modeStopwatch'),
        btnStart: document.getElementById('btnStart'),
        btnPause: document.getElementById('btnPause'),
        btnReset: document.getElementById('btnReset'),
        add30s: document.getElementById('add30s'),
        add1m: document.getElementById('add1m'),
        add5m: document.getElementById('add5m'),
        durationInput: document.getElementById('durationInput'),
        durationControls: document.getElementById('durationControls'),
        addTimeControls: document.getElementById('addTimeControls'),
        errorToast: document.getElementById('errorToast')
    };
    
    // ====================
    // Функции таймера
    // ====================
    
    // Вычисление текущего времени на основе состояния комнаты
    function calculateCurrentTime() {
        if (!currentRoom) return 0;
        
        const { mode, status, duration, started_at, current_offset } = currentRoom;
        const offset = current_offset || 0;
        
        if (status === TIMER_STATUS.STOPPED) {
            return mode === TIMER_MODE.COUNTDOWN ? duration : 0;
        }
        
        if (status === TIMER_STATUS.PAUSED) {
            if (mode === TIMER_MODE.COUNTDOWN) {
                return Math.max(0, duration - offset);
            } else {
                return offset;
            }
        }
        
        // Running
        if (mode === TIMER_MODE.COUNTDOWN) {
            if (!started_at) {
                return Math.max(0, duration - offset);
            }
            const now = Date.now();
            const startedTime = new Date(started_at).getTime();
            const elapsed = Math.floor((now - startedTime) / 1000);
            return Math.max(0, duration - elapsed);
        } else {
            // Stopwatch
            if (!started_at) {
                return offset;
            }
            const now = Date.now();
            const startedTime = new Date(started_at).getTime();
            const elapsed = Math.floor((now - startedTime) / 1000);
            return elapsed;
        }
    }
    
    // Обновление отображения таймера
    function updateTimerDisplay() {
        const seconds = calculateCurrentTime();
        elements.timerDisplay.textContent = formatTime(seconds);
        
        // Обновление подсказки
        if (currentRoom?.mode === TIMER_MODE.COUNTDOWN) {
            if (currentRoom?.status === TIMER_STATUS.STOPPED) {
                elements.timerSubtext.textContent = 'Таймер';
            } else if (currentRoom?.status === TIMER_STATUS.PAUSED) {
                elements.timerSubtext.textContent = 'Приостановлен';
            } else {
                elements.timerSubtext.textContent = seconds <= 0 ? 'Время вышло!' : 'Таймер';
            }
        } else {
            elements.timerSubtext.textContent = currentRoom?.status === TIMER_STATUS.PAUSED 
                ? 'Приостановлен' 
                : 'Секундомер';
        }
        
        updateButtonStates();
    }
    
    // Запуск локального интервала таймера
    function startLocalTimer() {
        if (localTimerInterval) clearInterval(localTimerInterval);
        localTimerInterval = setInterval(updateTimerDisplay, 100);
    }
    
    // Остановка локального интервала
    function stopLocalTimer() {
        if (localTimerInterval) {
            clearInterval(localTimerInterval);
            localTimerInterval = null;
        }
    }
    
    // Обновление состояния кнопок
    function updateButtonStates() {
        const status = currentRoom?.status || TIMER_STATUS.STOPPED;
        
        elements.btnStart.disabled = status === TIMER_STATUS.RUNNING;
        elements.btnPause.disabled = status !== TIMER_STATUS.RUNNING;
        
        // Классы для кнопок
        if (status === TIMER_STATUS.RUNNING) {
            elements.statusIndicator.className = 'status-indicator status-running';
            elements.statusText.textContent = 'Работает';
        } else if (status === TIMER_STATUS.PAUSED) {
            elements.statusIndicator.className = 'status-indicator status-paused';
            elements.statusText.textContent = 'Приостановлен';
        } else {
            elements.statusIndicator.className = 'status-indicator status-stopped';
            elements.statusText.textContent = 'Остановлен';
        }
        
        // Показывать/скрывать элементы в зависимости от режима
        const isCountdown = currentRoom?.mode === TIMER_MODE.COUNTDOWN;
        elements.durationControls.style.display = isCountdown ? 'flex' : 'none';
        elements.addTimeControls.style.display = isCountdown ? 'flex' : 'none';
    }
    
    // ====================
    // Управление комнатой
    // ====================
    
    // Инициализация комнаты (создаём если не существует)
    async function initRoom() {
        try {
            // Пробуем загрузить комнату
            const { data: room, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('id', GLOBAL_ROOM_ID)
                .single();
            
            if (error && error.code !== 'PGRST116') {
                throw error;
            }
            
            if (!room) {
                // Создаём новую глобальную комнату
                const { data: newRoom, error: createError } = await supabase
                    .from('rooms')
                    .insert({
                        id: GLOBAL_ROOM_ID,
                        code: 'GLOBAL',
                        mode: 'countdown',
                        status: 'stopped',
                        duration: 300,
                        current_offset: 0
                    })
                    .select()
                    .single();
                
                if (createError) throw createError;
                currentRoom = newRoom;
            } else {
                currentRoom = room;
            }
            
            // Обновление UI
            updateModeButtons();
            elements.durationInput.value = Math.floor((currentRoom.duration || 300) / 60);
            updateTimerDisplay();
            
            // Запуск таймера если running
            if (currentRoom.status === TIMER_STATUS.RUNNING) {
                startLocalTimer();
            }
            
            // Подписка на изменения
            subscribeToRoom();
            
        } catch (error) {
            console.error('Init room error:', error);
            showError('Ошибка инициализации');
        }
    }
    
    // Обновление кнопок режима
    function updateModeButtons() {
        const isCountdown = currentRoom?.mode === TIMER_MODE.COUNTDOWN;
        elements.modeCountdown.classList.toggle('active', isCountdown);
        elements.modeStopwatch.classList.toggle('active', !isCountdown);
    }
    
    // Показ ошибки
    function showError(message) {
        elements.errorToast.textContent = message;
        elements.errorToast.classList.remove('hidden');
        setTimeout(() => {
            elements.errorToast.classList.add('hidden');
        }, 3000);
    }
    
    // ====================
    // Действия с таймером
    // ====================
    
    // Старт
    async function startTimer() {
        if (isUpdating || !currentRoom) return;
        isUpdating = true;
        
        try {
            const now = new Date();
            const nowISO = now.toISOString();
            let updateData = {
                status: TIMER_STATUS.RUNNING,
                updated_at: nowISO
            };
            
            if (!currentRoom.started_at) {
                const currentOffset = currentRoom.current_offset || 0;
                const offsetMs = currentOffset * 1000;
                const adjustedStart = new Date(now.getTime() - offsetMs);
                updateData.started_at = adjustedStart.toISOString();
            }
            
            const { error } = await supabase
                .from('rooms')
                .update(updateData)
                .eq('id', GLOBAL_ROOM_ID);
            
            if (error) throw error;
            
        } catch (error) {
            console.error('Start error:', error);
            showError('Ошибка запуска');
        } finally {
            isUpdating = false;
        }
    }
    
    // Пауза
    async function pauseTimer() {
        if (isUpdating || !currentRoom) return;
        isUpdating = true;
        
        try {
            let newOffset = 0;
            
            if (currentRoom.started_at) {
                const now = Date.now();
                const startedTime = new Date(currentRoom.started_at).getTime();
                newOffset = Math.floor((now - startedTime) / 1000);
            }
            
            const { error } = await supabase
                .from('rooms')
                .update({
                    status: TIMER_STATUS.PAUSED,
                    current_offset: newOffset,
                    started_at: null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', GLOBAL_ROOM_ID);
            
            if (error) throw error;
            
        } catch (error) {
            console.error('Pause error:', error);
            showError('Ошибка паузы');
        } finally {
            isUpdating = false;
        }
    }
    
    // Сброс
    async function resetTimer() {
        if (isUpdating || !currentRoom) return;
        isUpdating = true;
        
        try {
            const { error } = await supabase
                .from('rooms')
                .update({
                    status: TIMER_STATUS.STOPPED,
                    started_at: null,
                    paused_at: null,
                    current_offset: 0,
                    duration: currentRoom.mode === TIMER_MODE.COUNTDOWN 
                        ? parseInt(elements.durationInput.value) * 60 
                        : 0,
                    updated_at: new Date().toISOString()
                })
                .eq('id', GLOBAL_ROOM_ID);
            
            if (error) throw error;
            
        } catch (error) {
            console.error('Reset error:', error);
            showError('Ошибка сброса');
        } finally {
            isUpdating = false;
        }
    }
    
    // Изменение режима
    async function changeMode(newMode) {
        if (isUpdating || !currentRoom) return;
        if (currentRoom.status !== TIMER_STATUS.STOPPED) {
            showError('Остановите таймер для смены режима');
            return;
        }
        isUpdating = true;
        
        try {
            const updateData = {
                mode: newMode,
                status: TIMER_STATUS.STOPPED,
                duration: newMode === TIMER_MODE.COUNTDOWN 
                    ? parseInt(elements.durationInput.value) * 60 
                    : 0,
                updated_at: new Date().toISOString()
            };
            
            const { error } = await supabase
                .from('rooms')
                .update(updateData)
                .eq('id', GLOBAL_ROOM_ID);
            
            if (error) throw error;
            
        } catch (error) {
            console.error('Change mode error:', error);
            showError('Ошибка смены режима');
        } finally {
            isUpdating = false;
        }
    }
    
    // Изменение длительности
    async function changeDuration() {
        if (isUpdating || !currentRoom) return;
        if (currentRoom.mode !== TIMER_MODE.COUNTDOWN) return;
        if (currentRoom.status !== TIMER_STATUS.STOPPED) return;
        
        isUpdating = true;
        
        try {
            const minutes = parseInt(elements.durationInput.value) || 5;
            const duration = Math.max(60, Math.min(10800, minutes * 60));
            
            const { error } = await supabase
                .from('rooms')
                .update({
                    duration: duration,
                    updated_at: new Date().toISOString()
                })
                .eq('id', GLOBAL_ROOM_ID);
            
            if (error) throw error;
            
        } catch (error) {
            console.error('Change duration error:', error);
        } finally {
            isUpdating = false;
        }
    }
    
    // Добавление времени
    async function addTime(seconds) {
        if (isUpdating || !currentRoom) return;
        
        isUpdating = true;
        
        try {
            let newDuration = (currentRoom.duration || 0) + seconds;
            if (currentRoom.mode === TIMER_MODE.COUNTDOWN) {
                newDuration = Math.max(0, newDuration);
            }
            
            const { error } = await supabase
                .from('rooms')
                .update({
                    duration: newDuration,
                    updated_at: new Date().toISOString()
                })
                .eq('id', GLOBAL_ROOM_ID);
            
            if (error) throw error;
            
        } catch (error) {
            console.error('Add time error:', error);
        } finally {
            isUpdating = false;
        }
    }
    
    // ====================
    // Supabase Realtime
    // ====================
    
    // Подписка на изменения комнаты
    function subscribeToRoom() {
        supabase
            .channel(`room:${GLOBAL_ROOM_ID}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'rooms',
                filter: `id=eq.${GLOBAL_ROOM_ID}`
            }, (payload) => {
                console.log('Room changed:', payload);
                
                if (payload.eventType === 'UPDATE') {
                    currentRoom = { ...currentRoom, ...payload.new };
                    
                    updateModeButtons();
                    updateTimerDisplay();
                    
                    if (currentRoom.status === TIMER_STATUS.RUNNING) {
                        startLocalTimer();
                    } else {
                        stopLocalTimer();
                        updateTimerDisplay();
                    }
                }
            })
            .subscribe((status) => {
                console.log('Room subscription status:', status);
            });
    }
    
    // ====================
    // Инициализация
    // ====================
    
    // Обработчики событий
    elements.btnStart.addEventListener('click', startTimer);
    elements.btnPause.addEventListener('click', pauseTimer);
    elements.btnReset.addEventListener('click', resetTimer);
    
    elements.modeCountdown.addEventListener('click', () => changeMode(TIMER_MODE.COUNTDOWN));
    elements.modeStopwatch.addEventListener('click', () => changeMode(TIMER_MODE.STOPWATCH));
    
    elements.durationInput.addEventListener('change', changeDuration);
    
    elements.add30s.addEventListener('click', () => addTime(30));
    elements.add1m.addEventListener('click', () => addTime(60));
    elements.add5m.addEventListener('click', () => addTime(300));
    
    // Запуск
    await initRoom();
});

// ====================
// Scheduled Timers Module
// ====================

document.addEventListener('DOMContentLoaded', () => {
    const supabase = window.SM_Timer?.supabase;
    if (!supabase) {
        console.warn('Supabase not initialized, skipping scheduled timers');
        return;
    }
    
    // Состояние
    let scheduledTimers = [];
    let scheduledInterval = null;
    let activeTimerId = null;
    
    // DOM элементы
    const elements = {
        scheduledList: document.getElementById('scheduledList'),
        addTimerBtn: document.getElementById('addScheduledTimerBtn'),
        modal: document.getElementById('addTimerModal'),
        modalForm: document.getElementById('addTimerForm'),
        cancelBtn: document.getElementById('cancelAddTimer'),
        timerName: document.getElementById('timerName'),
        timerDate: document.getElementById('timerDate'),
        timerTime: document.getElementById('timerTime'),
        timerDuration: document.getElementById('timerDuration'),
        timerRepeat: document.getElementById('timerRepeat'),
        editModal: document.getElementById('editTimerModal'),
        editForm: document.getElementById('editTimerForm'),
        editTimerId: document.getElementById('editTimerId'),
        editTimerName: document.getElementById('editTimerName'),
        editTimerDate: document.getElementById('editTimerDate'),
        editTimerTime: document.getElementById('editTimerTime'),
        editTimerDuration: document.getElementById('editTimerDuration'),
        editTimerRepeat: document.getElementById('editTimerRepeat'),
        cancelEditBtn: document.getElementById('cancelEditTimer'),
        nextTimerCountdown: document.getElementById('nextTimerCountdown'),
        nextTimerTime: document.getElementById('nextTimerTime')
    };
    
    // Загрузка запланированных таймеров
    async function loadScheduledTimers() {
        try {
            // Сначала проверим существует ли комната
            const { data: room, error: roomError } = await supabase
                .from('rooms')
                .select('id')
                .eq('id', GLOBAL_ROOM_ID)
                .single();
            
            if (roomError) {
                console.error('Room not found:', roomError);
                console.log('GLOBAL_ROOM_ID:', GLOBAL_ROOM_ID);
            } else {
                console.log('Room exists:', room);
            }
            
            const { data, error } = await supabase
                .from('scheduled_timers')
                .select('*')
                .order('start_time', { ascending: true });
            
            if (error) {
                console.error('Error loading scheduled timers:', error);
                throw error;
            }
            
            console.log('Loaded scheduled timers:', data);
            scheduledTimers = data || [];
            renderScheduledTimers();
            startScheduledChecker();
        } catch (error) {
            console.error('Error loading scheduled timers:', error);
        }
    }
    
    // Форматирование времени (HH:MM)
    function formatTimeHM(date) {
        return date.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    }
    
    // Форматирование даты (DD.MM.YYYY)
    function formatDateDMY(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }
    
    // Форматирование даты и времени для отображения
    function formatDateTime(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        const timeStr = formatTimeHM(date);
        
        if (targetDate.getTime() === today.getTime()) {
            return `Сегодня, ${timeStr}`;
        } else if (targetDate.getTime() === tomorrow.getTime()) {
            return `Завтра, ${timeStr}`;
        } else {
            return `${formatDateDMY(date)}, ${timeStr}`;
        }
    }
    
    // Форматирование оставшегося времени (MM:SS или HH:MM)
    function formatRemainingTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Определение статуса таймера
    function getTimerStatus(timer) {
        // Если таймер уже запущен вручную, возвращаем stored status
        if (timer.status === 'running' || timer.status === 'cancelled' || timer.status === 'completed') {
            return timer.status;
        }
        
        const now = new Date();
        const startTime = new Date(timer.start_time);
        const endTime = new Date(startTime.getTime() + timer.duration * 1000);
        
        if (now < startTime) {
            return 'pending';
        }
        
        if (now >= startTime && now < endTime) {
            return 'running';
        }
        
        return 'expired';
    }
    
    // Получение оставшегося времени для активного таймера
    function getRemainingSeconds(timer) {
        // Если есть started_at, используем его для расчёта
        if (timer.started_at) {
            const now = new Date();
            const startedTime = new Date(timer.started_at);
            const elapsed = Math.floor((now - startedTime) / 1000);
            return Math.max(0, timer.duration - elapsed);
        }
        
        const now = new Date();
        const startTime = new Date(timer.start_time);
        const endTime = new Date(startTime.getTime() + timer.duration * 1000);
        const remaining = Math.floor((endTime - now) / 1000);
        return Math.max(0, remaining);
    }
    
    // Рендер списка таймеров
    function renderScheduledTimers() {
        if (scheduledTimers.length === 0) {
            elements.scheduledList.innerHTML = '<div class="empty-state">Нет запланированных таймеров</div>';
            updateNextTimerCountdown();
            return;
        }
        
        elements.scheduledList.innerHTML = scheduledTimers.map(timer => {
            const status = getTimerStatus(timer);
            const startTime = new Date(timer.start_time);
            const durationMinutes = Math.floor(timer.duration / 60);
            let remainingHtml = '';
            let actionsHtml = '';
            
            // Определение повтора
            let repeatHtml = '';
            if (timer.repeat_type === 'daily') {
                repeatHtml = '<span class="text-xs text-blue-400"><svg class="inline w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>Ежедневно</span>';
            } else if (timer.repeat_type === 'weekly') {
                repeatHtml = '<span class="text-xs text-purple-400"><svg class="inline w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>Еженедельно</span>';
            }
            
            if (status === 'running') {
                const remaining = getRemainingSeconds(timer);
                remainingHtml = `<div class="scheduled-item-remaining">Осталось: ${formatRemainingTime(remaining)}</div>`;
                
                // Кнопка паузы/отмены для запущенного таймера
                actionsHtml = `
                    <button class="scheduled-item-cancel" data-id="${timer.id}" title="Отменить" onclick="cancelScheduledTimer('${timer.id}')"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"/></svg></button>
                `;
            } else if (status === 'pending') {
                // Кнопка запуска и редактирования для ожидающего таймера
                actionsHtml = `
                    <button class="scheduled-item-play" data-id="${timer.id}" title="Запустить сейчас" onclick="startScheduledTimerNow('${timer.id}')"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg></button>
                    <button class="scheduled-item-edit" data-id="${timer.id}" title="Редактировать" onclick="openEditModal('${timer.id}')"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg></button>
                    <button class="scheduled-item-delete" data-id="${timer.id}" title="Удалить"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>
                `;
            } else if (status === 'completed') {
                // Показать кнопку повтора для завершённого
                actionsHtml = `
                    <button class="scheduled-item-play" data-id="${timer.id}" title="Повторить" onclick="repeatScheduledTimer('${timer.id}')"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg></button>
                    <button class="scheduled-item-delete" data-id="${timer.id}" title="Удалить"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg></button>
                `;
            } else {
                // expired или cancelled
                actionsHtml = `
                    <button class="scheduled-item-delete" data-id="${timer.id}" title="Удалить">&times;</button>
                `;
            }
            
            return `
                <div class="scheduled-item ${status}" data-id="${timer.id}">
                    <div class="scheduled-item-info">
                        <div class="scheduled-item-time">${formatDateTime(startTime)}</div>
                        <div class="scheduled-item-duration">${durationMinutes} мин ${repeatHtml}</div>
                        ${timer.name ? `<div class="scheduled-item-name">${escapeHtml(timer.name)}</div>` : ''}
                        ${remainingHtml}
                    </div>
                    <div class="scheduled-item-actions">
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }).join('');
        
        // Добавить обработчики для кнопок удаления
        elements.scheduledList.querySelectorAll('.scheduled-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteScheduledTimer(btn.dataset.id);
            });
        });
        
        // Обновление обратного отсчёта до следующего таймера
        updateNextTimerCountdown();
    }
    
    // Обновление отображения времени до следующего таймера
    function updateNextTimerCountdown() {
        const now = new Date();
        const pendingTimers = scheduledTimers.filter(t => {
            const status = getTimerStatus(t);
            return status === 'pending';
        });
        
        if (pendingTimers.length > 0) {
            const nextTimer = pendingTimers.reduce(( earliest, t) => {
                const tTime = new Date(t.start_time);
                const eTime = new Date(earliest.start_time);
                return tTime < eTime ? t : earliest;
            });
            
            const nextTime = new Date(nextTimer.start_time);
            const diffMs = nextTime - now;
            const diffMins = Math.floor(diffMs / 60000);
            const diffSecs = Math.floor((diffMs % 60000) / 1000);
            
            elements.nextTimerCountdown.classList.remove('hidden');
            elements.nextTimerCountdown.classList.add('active');
            elements.nextTimerTime.textContent = `${diffMins}:${diffSecs.toString().padStart(2, '0')}`;
        } else {
            elements.nextTimerCountdown.classList.add('hidden');
        }
    }
    
    // Экранирование HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Добавление нового таймера
    async function addScheduledTimer(name, dateStr, timeStr, durationMinutes, repeatType = 'none') {
        try {
            // Создаем дату на основе указанной даты и времени
            const [year, month, day] = dateStr.split('-').map(Number);
            const [hours, minutes] = timeStr.split(':').map(Number);
            const startTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
            
            // Если время уже прошло, не переносим на завтра (пусть пользователь сам выберет дату)
            const now = new Date();
            
            console.log('Adding timer:', {
                room_id: GLOBAL_ROOM_ID,
                name: name,
                start_time: startTime.toISOString(),
                duration: durationMinutes * 60,
                status: 'pending',
                remaining_seconds: durationMinutes * 60,
                repeat_type: repeatType
            });
            
            const { data, error } = await supabase
                .from('scheduled_timers')
                .insert({
                    room_id: GLOBAL_ROOM_ID,
                    name: name,
                    start_time: startTime.toISOString(),
                    duration: durationMinutes * 60,
                    status: 'pending',
                    remaining_seconds: durationMinutes * 60,
                    repeat_type: repeatType
                })
                .select();
            
            if (error) {
                console.error('Supabase error:', error);
                alert('Ошибка добавления таймера: ' + error.message);
                throw error;
            }
            
            console.log('Timer added successfully:', data);
            // Не добавляем локально - это сделает подписка realtime
        } catch (error) {
            console.error('Error adding scheduled timer:', error);
            alert('Ошибка: ' + error.message);
        }
    }
    
    // Запуск таймера вручную (до назначенного времени)
    window.startScheduledTimerNow = async function(id) {
        console.log('Starting timer manually:', id);
        const timer = scheduledTimers.find(t => t.id === id);
        console.log('Found timer:', timer);
        if (!timer || timer.status !== 'pending') {
            console.log('Timer not found or not pending');
            return;
        }
        
        try {
            const now = new Date();
            console.log('Updating timer to running...');
            const { data, error } = await supabase
                .from('scheduled_timers')
                .update({
                    status: 'running',
                    started_at: now.toISOString(),
                    remaining_seconds: timer.duration
                })
                .eq('id', id)
                .select();
            
            if (error) {
                console.error('Error starting timer:', error);
                alert('Ошибка: ' + error.message);
            } else {
                console.log('Timer started successfully:', data);
            }
        } catch (error) {
            console.error('Error starting timer now:', error);
        }
    };
    
    // Отмена запущенного таймера
    window.cancelScheduledTimer = async function(id) {
        const timer = scheduledTimers.find(t => t.id === id);
        if (!timer || timer.status !== 'running') return;
        
        try {
            await supabase
                .from('scheduled_timers')
                .update({
                    status: 'cancelled',
                    remaining_seconds: 0
                })
                .eq('id', id);
        } catch (error) {
            console.error('Error cancelling timer:', error);
        }
    };
    
    // Повтор завершённого таймера
    window.repeatScheduledTimer = async function(id) {
        const timer = scheduledTimers.find(t => t.id === id);
        if (!timer) return;
        
        try {
            const now = new Date();
            const startTime = new Date(now.getTime() + 60000); // Через минуту
            
            await supabase
                .from('scheduled_timers')
                .insert({
                    room_id: GLOBAL_ROOM_ID,
                    name: timer.name,
                    start_time: startTime.toISOString(),
                    duration: timer.duration,
                    status: 'pending',
                    remaining_seconds: timer.duration,
                    repeat_type: timer.repeat_type
                });
        } catch (error) {
            console.error('Error repeating timer:', error);
        }
    };
    
    // Открытие модального окна редактирования
    window.openEditModal = function(id) {
        const timer = scheduledTimers.find(t => t.id === id);
        if (!timer) return;
        
        elements.editTimerId.value = timer.id;
        elements.editTimerName.value = timer.name || '';
        
        // Конвертация даты и времени
        const startTime = new Date(timer.start_time);
        const year = startTime.getFullYear();
        const month = (startTime.getMonth() + 1).toString().padStart(2, '0');
        const day = startTime.getDate().toString().padStart(2, '0');
        const hours = startTime.getHours().toString().padStart(2, '0');
        const minutes = startTime.getMinutes().toString().padStart(2, '0');
        
        elements.editTimerDate.value = `${year}-${month}-${day}`;
        elements.editTimerTime.value = `${hours}:${minutes}`;
        
        elements.editTimerDuration.value = Math.floor(timer.duration / 60);
        elements.editTimerRepeat.value = timer.repeat_type || 'none';
        
        elements.editModal.classList.add('active');
    };
    
    // Закрытие модального окна редактирования
    function closeEditModal() {
        elements.editModal.classList.remove('active');
    }
    
    // Редактирование таймера
    async function editScheduledTimer(id, name, dateStr, timeStr, durationMinutes, repeatType) {
        try {
            const timer = scheduledTimers.find(t => t.id === id);
            if (!timer) return;
            
            // Создаем дату на основе указанной даты и времени
            const [year, month, day] = dateStr.split('-').map(Number);
            const [hours, minutes] = timeStr.split(':').map(Number);
            const startTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
            
            const { error } = await supabase
                .from('scheduled_timers')
                .update({
                    name: name,
                    start_time: startTime.toISOString(),
                    duration: durationMinutes * 60,
                    remaining_seconds: durationMinutes * 60,
                    repeat_type: repeatType,
                    status: 'pending'
                })
                .eq('id', id);
            
            if (error) throw error;
        } catch (error) {
            console.error('Error editing scheduled timer:', error);
        }
    }
    
    // Удаление таймера
    async function deleteScheduledTimer(id) {
        try {
            const { error } = await supabase
                .from('scheduled_timers')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            // Не удаляем локально - это сделает подписка realtime
        } catch (error) {
            console.error('Error deleting scheduled timer:', error);
        }
    }
    
    // Запуск проверки и обновления таймеров
    function startScheduledChecker() {
        if (scheduledInterval) clearInterval(scheduledInterval);
        
        scheduledInterval = setInterval(async () => {
            let hasChanges = false;
            const now = new Date();
            
            for (const timer of scheduledTimers) {
                const status = getTimerStatus(timer);
                const startTime = new Date(timer.start_time);
                const endTime = new Date(startTime.getTime() + timer.duration * 1000);
                
                // Если таймер должен начаться
                if (status === 'running' && timer.status !== 'running') {
                    try {
                        await supabase
                            .from('scheduled_timers')
                            .update({ 
                                status: 'running',
                                started_at: now.toISOString(),
                                remaining_seconds: timer.duration
                            })
                            .eq('id', timer.id);
                        
                        timer.status = 'running';
                        timer.started_at = now.toISOString();
                        hasChanges = true;
                        
                        // Показать уведомление
                        showNotification('Таймер запущен!', timer.name || 'Запланированный таймер');
                    } catch (error) {
                        console.error('Error starting timer:', error);
                    }
                }
                
                // Обновление оставшегося времени для активного таймера
                if (timer.status === 'running') {
                    const remaining = getRemainingSeconds(timer);
                    
                    if (remaining <= 0) {
                        // Таймер завершен
                        try {
                            // Если это повторяющийся таймер - планируем следующий
                            if (timer.repeat_type && timer.repeat_type !== 'none') {
                                const nextStart = new Date(timer.start_time);
                                if (timer.repeat_type === 'daily') {
                                    nextStart.setDate(nextStart.getDate() + 1);
                                } else if (timer.repeat_type === 'weekly') {
                                    nextStart.setDate(nextStart.getDate() + 7);
                                }
                                
                                // Создаём новый таймер для следующего раза
                                await supabase
                                    .from('scheduled_timers')
                                    .insert({
                                        room_id: GLOBAL_ROOM_ID,
                                        name: timer.name,
                                        start_time: nextStart.toISOString(),
                                        duration: timer.duration,
                                        status: 'pending',
                                        remaining_seconds: timer.duration,
                                        repeat_type: timer.repeat_type
                                    });
                                
                                // Помечаем текущий как завершённый
                                await supabase
                                    .from('scheduled_timers')
                                    .update({ 
                                        status: 'completed',
                                        completed_at: now.toISOString(),
                                        remaining_seconds: 0
                                    })
                                    .eq('id', timer.id);
                                
                                timer.status = 'completed';
                            } else {
                                await supabase
                                    .from('scheduled_timers')
                                    .update({ 
                                        status: 'completed',
                                        completed_at: now.toISOString(),
                                        remaining_seconds: 0
                                    })
                                    .eq('id', timer.id);
                                
                                timer.status = 'completed';
                            }
                            
                            timer.completed_at = now.toISOString();
                            hasChanges = true;
                            
                            // Показать уведомление о завершении
                            showNotification('Таймер завершен!', timer.name || 'Запланированный таймер');
                        } catch (error) {
                            console.error('Error completing timer:', error);
                        }
                    } else {
                        // Периодически обновляем оставшееся время в БД
                        if (remaining % 10 === 0) {
                            try {
                                await supabase
                                    .from('scheduled_timers')
                                    .update({ remaining_seconds: remaining })
                                    .eq('id', timer.id);
                            } catch (error) {
                                // Игнорируем ошибки обновления
                            }
                        }
                    }
                }
            }
            
            if (hasChanges) {
                renderScheduledTimers();
            } else {
                // Просто обновляем отображение оставшегося времени
                const runningTimers = scheduledTimers.filter(t => t.status === 'running');
                if (runningTimers.length > 0) {
                    renderScheduledTimers();
                }
                // Также обновляем countdown до следующего
                updateNextTimerCountdown();
            }
        }, 1000);
    }
    
    // Показ уведомления
    function showNotification(title, body) {
        // Воспроизводим звук уведомления
        try {
            const audio = new Audio('notif.mp3');
            audio.play().catch(e => console.log('Не удалось воспроизвести звук:', e));
        } catch (e) {
            console.log('Ошибка воспроизведения звука:', e);
        }
        
        // Используем Notification API
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification(title, {
                    body: body,
                    icon: 'icon.png'
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(title, {
                            body: body,
                            icon: 'icon.png'
                        });
                    }
                });
            }
        }
        
        // Также показываем alert как резервный вариант
        setTimeout(() => {
            alert(`${title}\n${body}`);
        }, 1000);
    }
    
    // Открытие модального окна
    function openModal() {
        elements.modal.classList.add('active');
        elements.timerName.value = '';
        elements.timerDate.value = '';
        elements.timerTime.value = '';
        elements.timerDuration.value = '5';
        elements.timerRepeat.value = 'none';
        
        // Устанавливаем сегодняшнюю дату по умолчанию
        const today = new Date();
        elements.timerDate.value = today.toISOString().split('T')[0];
        
        elements.timerName.focus();
    }
    
    // Закрытие модального окна
    function closeModal() {
        elements.modal.classList.remove('active');
    }
    
    // Обработчики событий
    elements.addTimerBtn.addEventListener('click', openModal);
    elements.cancelBtn.addEventListener('click', closeModal);
    elements.cancelEditBtn.addEventListener('click', closeEditModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) {
            closeModal();
        }
    });
    elements.editModal.addEventListener('click', (e) => {
        if (e.target === elements.editModal) {
            closeEditModal();
        }
    });
    
    // Обработчики быстрых значений длительности
    document.querySelectorAll('.duration-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.timerDuration.value = btn.dataset.duration;
        });
    });
    
    elements.modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = elements.timerName.value.trim();
        const date = elements.timerDate.value;
        const time = elements.timerTime.value;
        const duration = parseInt(elements.timerDuration.value);
        const repeat = elements.timerRepeat.value;
        
        if (name && date && time && duration > 0) {
            await addScheduledTimer(name, date, time, duration, repeat);
            closeModal();
        }
    });
    
    elements.editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = elements.editTimerId.value;
        const name = elements.editTimerName.value.trim();
        const date = elements.editTimerDate.value;
        const time = elements.editTimerTime.value;
        const duration = parseInt(elements.editTimerDuration.value);
        const repeat = elements.editTimerRepeat.value;
        
        if (id && name && date && time && duration > 0) {
            await editScheduledTimer(id, name, date, time, duration, repeat);
            closeEditModal();
        }
    });
    
    // Подписка на изменения в БД
    supabase
        .channel('scheduled_timers')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'scheduled_timers'
        }, (payload) => {
            console.log('Scheduled timer changed:', payload);
            
            if (payload.eventType === 'INSERT') {
                scheduledTimers.push(payload.new);
                scheduledTimers.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            } else if (payload.eventType === 'UPDATE') {
                const index = scheduledTimers.findIndex(t => t.id === payload.new.id);
                if (index !== -1) {
                    scheduledTimers[index] = { ...scheduledTimers[index], ...payload.new };
                }
            } else if (payload.eventType === 'DELETE') {
                scheduledTimers = scheduledTimers.filter(t => t.id !== payload.old.id);
            }
            
            renderScheduledTimers();
        })
        .subscribe((status) => {
            console.log('Scheduled timers subscription status:', status);
        });
    
    // Загрузка таймеров при инициализации
    loadScheduledTimers();
});
