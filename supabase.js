/**
 * SM-Timer Supabase Client
 * ========================
 * Конфигурация и инициализация Supabase клиента
 */

const SUPABASE_URL = 'https://omvsjlpmhstrlobemsyg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tdnNqbHBtaHN0cmxvYmVtc3lnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4ODc1MDEsImV4cCI6MjA4ODQ2MzUwMX0.HuYwxP7v6m59qeOAM5jKf2nIMSKXU7s-bBMEBr-6Aug';

// Создаём Supabase клиент
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Удаляем глобальную переменную supabase, чтобы избежать конфликтов
delete window.supabase;

// Константы режимов таймера
const TIMER_MODE = {
    COUNTDOWN: 'countdown',
    STOPWATCH: 'stopwatch'
};

// Константы статусов таймера
const TIMER_STATUS = {
    STOPPED: 'stopped',
    RUNNING: 'running',
    PAUSED: 'paused'
};

// Форматирование времени (секунды в mm:ss или hh:mm:ss)
function formatTime(totalSeconds) {
    const isNegative = totalSeconds < 0;
    const absSeconds = Math.abs(totalSeconds);
    
    const hours = Math.floor(absSeconds / 3600);
    const minutes = Math.floor((absSeconds % 3600) / 60);
    const seconds = absSeconds % 60;
    
    let timeStr;
    if (hours > 0) {
        timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    return isNegative ? `-${timeStr}` : timeStr;
}

// Экспорт для использования в других файлах
window.SM_Timer = {
    supabase: supabaseClient,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    TIMER_MODE,
    TIMER_STATUS,
    formatTime
};
