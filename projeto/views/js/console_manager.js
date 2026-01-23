/**
 * Console Manager - Gerencia a exibição e colorização de logs
 * Suporta níveis: INFO, SUCCESS, ERROR, WARNING
 * Redireciona console.log para o console visual
 */

class ConsoleManager {
    constructor() {
        this.consoleOutput = document.getElementById('console-output');
        this.logsTextarea = document.getElementById('logs');

        if (!this.consoleOutput) {
            // Se o HTML não estiver pronto, evita erros
            return;
        }
        this.maxLines = 500;
        this.lineCount = 0;

        // Intercepta console methods
        this.setupConsoleInterception();

        // Inicializa com mensagem de boas-vindas
        this.info('Sistema de monitoramento iniciado');
    }

    /**
     * Intercepta console.log, console.error, etc
     */
    setupConsoleInterception() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;

        console.log = (...args) => {
            originalLog.apply(console, args);
            this.log('INFO', args.join(' '));
        };

        console.error = (...args) => {
            originalError.apply(console, args);
            this.log('ERROR', args.join(' '));
        };

        console.warn = (...args) => {
            originalWarn.apply(console, args);
            this.log('WARNING', args.join(' '));
        };

        console.info = (...args) => {
            originalInfo.apply(console, args);
            this.log('INFO', args.join(' '));
        };
    }

    /**
     * Log com nível específico
     */
    log(level, message) {
        const timestamp = this.getTimestamp();

        // Cria elemento de linha
        const line = document.createElement('div');
        line.style.marginBottom = '2px';

        // Coloriza baseado no nível
        let levelSpan = '';
        switch (level) {
            case 'INFO':
                levelSpan = `<span class="log-info">[INFO]</span>`;
                break;
            case 'SUCCESS':
                levelSpan = `<span class="log-success">[✓ SUCESSO]</span>`;
                break;
            case 'ERROR':
                levelSpan = `<span class="log-error">[✗ ERRO]</span>`;
                break;
            case 'WARNING':
                levelSpan = `<span class="log-warning">[⚠ AVISO]</span>`;
                break;
            default:
                levelSpan = `<span>[${level}]</span>`;
        }

        line.innerHTML = `<span class="log-timestamp">${timestamp}</span> ${levelSpan} ${this.escapeHtml(message)}`;

        this.consoleOutput.appendChild(line);
        this.lineCount++;

        // Limpa linhas antigas se ultrapassar limite
        if (this.lineCount > this.maxLines) {
            const lines = this.consoleOutput.querySelectorAll('div');
            const removeCount = lines.length - this.maxLines;
            for (let i = 0; i < removeCount; i++) {
                lines[i].remove();
            }
        }

        // Auto-scroll para o final
        this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;

        // Mantém textarea sincronizado (fallback)
        if (this.logsTextarea) {
            const textarea = this.logsTextarea;
            textarea.value = (textarea.value + `[${timestamp}] ${level}: ${message}\n`).split('\n').slice(-this.maxLines).join('\n');
            textarea.scrollTop = textarea.scrollHeight;
        }
    }

    /**
     * Métodos de conveniência
     */
    info(message) { this.log('INFO', message); }
    success(message) { this.log('SUCCESS', message); }
    error(message) { this.log('ERROR', message); }
    warning(message) { this.log('WARNING', message); }

    /**
     * Limpa o console
     */
    clear() {
        this.consoleOutput.innerHTML = '';
        this.logsTextarea.value = '';
        this.lineCount = 0;
        this.info('Console limpo');
    }

    /**
     * Escapa caracteres HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formata timestamp
     */
    getTimestamp() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }
}

// Instancia globalmente quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.consoleManager = new ConsoleManager();
    });
} else {
    window.consoleManager = new ConsoleManager();
}
