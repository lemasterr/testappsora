import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { resolveChromeExecutablePath } from '../../platform/chromePaths';
import { logError } from '../utils/log';

// ====== ПУБЛИЧНЫЙ ИНТЕРФЕЙС ======

export interface ChromeLaunchOptions {
  port: number;              // CDP порт, например 8222
  profileDir: string;        // путь к user-data-dir для этой сессии
  startUrl?: string;         // URL, который надо открыть первым (по умолчанию about:blank)
  chromePath?: string;       // опционально: явный путь к Chrome из настроек
  headless?: boolean;        // опционально: запуск без UI
  extraArgs?: string[];      // опционально: доп. флаги
}

export interface ChromeLaunchResult {
  child: ChildProcess;
  port: number;
  profileDir: string;
  wsEndpoint: string;        // значение webSocketDebuggerUrl из /json/version
}

// Главная функция: запускает Chrome и ждёт, пока поднимется CDP.
export async function launchChromeWithCdp(options: ChromeLaunchOptions): Promise<ChromeLaunchResult> {
  // 1. Определяем исполняемый файл (из опций или автопоиск)
  let chromeExecutable: string;
  if (options.chromePath && fs.existsSync(options.chromePath)) {
    chromeExecutable = options.chromePath;
  } else {
    chromeExecutable = await resolveChromeExecutablePath();
  }

  const args = buildChromeArgs({
    port: options.port,
    profileDir: options.profileDir,
    startUrl: options.startUrl ?? 'about:blank',
    headless: options.headless ?? false,
    extraArgs: options.extraArgs ?? [],
  });

  // 1. Убедиться, что профильный каталог существует
  fs.mkdirSync(options.profileDir, { recursive: true });

  // 2. Запустить Chrome
  const child = spawn(chromeExecutable, args, {
    stdio: 'ignore',
    detached: false, // Связываем жизненный цикл (но child.unref в manager.ts может отвязать)
  });

  // 3. Подождать, пока поднимется CDP endpoint
  let wsEndpoint: string;
  try {
    const res = await waitForCdpEndpoint(options.port);
    wsEndpoint = res.wsEndpoint;
  } catch (e) {
    // Если CDP не поднялся — убиваем процесс, чтобы не висел зомби
    if (child.pid) {
      try {
        child.kill();
      } catch {
        // ignore process already dead
      }
    }
    throw e;
  }

  return {
    child,
    port: options.port,
    profileDir: options.profileDir,
    wsEndpoint,
  };
}

// ====== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ======

interface BuildArgsInput {
  port: number;
  profileDir: string;
  startUrl: string;
  headless: boolean;
  extraArgs: string[];
}

// Сбор аргументов запуска Chrome.
function buildChromeArgs(input: BuildArgsInput): string[] {
  const args: string[] = [];

  args.push(`--remote-debugging-port=${input.port}`);
  args.push(`--user-data-dir=${input.profileDir}`);

  // Стандартные флаги для автоматизации
  args.push('--no-first-run');
  args.push('--no-default-browser-check');
  args.push('--disable-background-networking');
  args.push('--disable-background-timer-throttling');
  args.push('--disable-client-side-phishing-detection');
  args.push('--disable-default-apps');
  args.push('--disable-popup-blocking');
  args.push('--disable-sync');
  args.push('--metrics-recording-only');
  args.push('--disable-renderer-backgrounding');
  args.push('--disable-features=TranslateUI,AutomationControlled'); // AutomationControlled отключает инфобар, но иногда мешает (анти-бот)
  args.push('--autoplay-policy=no-user-gesture-required');
  args.push('--start-maximized');

  if (input.headless) {
    args.push('--headless=new'); // новый режим headless
    args.push('--disable-gpu');
  }

  if (input.extraArgs.length > 0) {
    args.push(...input.extraArgs);
  }

  // В конце добавляем URL
  args.push(input.startUrl);

  return args;
}

// Ожидание, пока CDP endpoint станет доступен.
// Проверяем http://127.0.0.1:PORT/json/version каждые 500мс, максимум ~20 секунд.
async function waitForCdpEndpoint(port: number): Promise<{ wsEndpoint: string }> {
  const endpointUrl = `http://127.0.0.1:${port}/json/version`;
  const timeoutMs = 20000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(endpointUrl);
      if (res.ok) {
        const data = (await res.json()) as { webSocketDebuggerUrl?: string };
        if (data.webSocketDebuggerUrl) {
          return { wsEndpoint: data.webSocketDebuggerUrl };
        }
      }
    } catch {
      // игнорируем сетевые ошибки (порт еще закрыт), пробуем дальше
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Если не дождались — формируем подробную ошибку
  const errorMsg = 
    `Chrome CDP endpoint did not open at ${endpointUrl}. ` +
    'Это обычно означает, что Chrome не запустился с remote debugging для этого профиля.\n\n' +
    'Возможные причины:\n' +
    '- Chrome уже запущен для этого профиля БЕЗ флага "--remote-debugging-port".\n' +
    '- Указанный порт уже занят другим процессом.\n\n' +
    'Что сделать:\n' +
    '1) Полностью завершите все окна Chrome для этого профиля (Cmd+Q на macOS или "Quit" из Dock).\n' +
    '2) В приложении снова нажмите "Start Chrome".\n' +
    '3) Если проблема повторяется, попробуйте изменить CDP порт в настройках (например, на 9223).';

  logError(errorMsg);
  throw new Error(errorMsg);
}
