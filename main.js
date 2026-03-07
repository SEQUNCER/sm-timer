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
