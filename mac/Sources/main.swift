import AppKit
import WebKit

/// «Гром» на маке: герой на рабочем столе (Pet.swift) и окно характеристик со страницей героя. Раз в 30 с и при открытии забирает state.json с claude-vps по ssh
/// и передаёт его странице через window.gromState; действия со страницы дописывает в очередь бота.
enum Settings {
    static let pageURL = URL(string: "https://tema-mail.github.io/grom-app/")!
    static let windowSize = NSSize(width: 420, height: 760)
    static let minSize = NSSize(width: 360, height: 480)
    static let frameName = "GromWindow"
    static let pollInterval: TimeInterval = 30
    static let afterActionDelay: TimeInterval = 3
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var timer: Timer?
    private var lastState: String?
    private var pageReady = false
    private var fetching = false
    private let queue = DispatchQueue(label: "grom.ssh", qos: .utility)
    private var pet: PetController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        makeMenu()
        makeWindow()
        pet = PetController(pageURL: Settings.pageURL)
        pet.onOpenStats = { [weak self] in self?.showWindow() }
        showWindow()
        // опрос идёт и при закрытом окне: герой на столе тоже показывает форму и шмот
        timer = Timer.scheduledTimer(withTimeInterval: Settings.pollInterval, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    /// Нажатие на значок в Dock: окно открывается снова и сразу берёт свежее состояние.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return false
    }

    /// Закрытое окно – не выход: приложение остаётся в Dock.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    private func makeWindow() {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "grom")
        webView = WKWebView(frame: NSRect(origin: .zero, size: Settings.windowSize), configuration: config)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]

        window = NSWindow(contentRect: NSRect(origin: .zero, size: Settings.windowSize),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Гром"
        window.minSize = Settings.minSize
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName(Settings.frameName)
        loadPage()
    }

    private func loadPage() {
        pageReady = false
        webView.load(URLRequest(url: Settings.pageURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
    }

    private func showWindow() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        refresh()
    }

    @objc private func reloadPage(_ sender: Any?) { loadPage() }

    // MARK: состояние

    private func refresh() {
        guard !fetching else { return }
        fetching = true
        queue.async { [weak self] in
            let result = Server.readState()
            DispatchQueue.main.async {
                guard let self else { return }
                self.fetching = false
                switch result {
                case .success(let json):
                    self.lastState = json
                    self.push()
                    if let obj = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] {
                        self.pet.update(obj)
                    }
                case .failure(let error):
                    NSLog("Гром: нет состояния – \(error.description)")
                    self.js("window.gromSvyaz && window.gromSvyaz(false)")
                }
            }
        }
    }

    private func push() {
        guard pageReady, window.isVisible, let json = lastState else { return }
        js("window.gromState && window.gromState(\(json))")
    }

    private func js(_ code: String) {
        guard pageReady else { return }
        webView.evaluateJavaScript(code, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        if lastState != nil { push() }
        refresh()
        selfTest()
    }

    /// Самопроверка всего пути действия (страница → postMessage → ssh → очередь бота) без нажатий:
    /// GROM_TEST_ACTION='{"a":"snyat","slot":"ruka"}' ~/Applications/Grom.app/Contents/MacOS/Grom
    private var selfTestDone = false
    private func selfTest() {
        guard !selfTestDone, let action = ProcessInfo.processInfo.environment["GROM_TEST_ACTION"],
              let data = try? JSONSerialization.data(withJSONObject: [action]),
              let literal = String(data: data, encoding: .utf8) else { return }
        selfTestDone = true
        js("window.webkit.messageHandlers.grom.postMessage(\(literal)[0])")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("Гром: страница не загрузилась – \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("Гром: страница не открылась – \(error.localizedDescription)")
        let html = "<body style='font:15px -apple-system;padding:24px;background:#141518;color:#e9e9e6'>"
            + "<h3>Страница героя не открылась</h3><p>Нет интернета или GitHub недоступен. Обновить – Cmd+R.</p></body>"
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: действия со страницы

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "grom", let raw = message.body as? String else { return }
        guard Server.validAction(raw) else {
            js("window.gromToast && window.gromToast('Действие не прошло проверку и не отправлено.')")
            return
        }
        queue.async { [weak self] in
            let result = Server.append(raw)
            DispatchQueue.main.async {
                guard let self else { return }
                if case .failure(let error) = result {
                    NSLog("Гром: действие не ушло – \(error.description)")
                    self.js("window.gromToast && window.gromToast('Нет связи с сервером – действие не отправлено.')")
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + Settings.afterActionDelay) { self.refresh() }
            }
        }
    }

    // MARK: меню

    private func makeMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Скрыть «Гром»", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Выйти из «Гром»", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        main.addItem(editItem)
        let edit = NSMenu(title: "Правка")
        edit.addItem(withTitle: "Скопировать", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Выбрать всё", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit

        let winItem = NSMenuItem()
        main.addItem(winItem)
        let win = NSMenu(title: "Окно")
        win.addItem(withTitle: "Обновить", action: #selector(reloadPage(_:)), keyEquivalent: "r")
        win.addItem(withTitle: "Свернуть", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Закрыть", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = win
        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
