import AppKit
import ImageIO

/// Герой на рабочем столе: прозрачное окно без рамки поверх всех окон, фокус не забирает.
/// Ходит по горизонтали (внизу экрана, пока его не перетащили), иногда стоит; в выходной и в нокауте лежит.
/// Нажатие – облачко «Хули надо?», второе нажатие, пока облачко висит, – окно характеристик.
/// Слои те же, что на странице: sprites/manifest.json и *.webp с GitHub Pages, тело по форме из state.json.

struct PetLayer {
    let files: [String: String]
    let z: Int
    let anims: [String]
}

/// Слои LPC со страницы героя. Грузятся один раз при запуске; без них герой просто не рисуется.
final class PetSprites {
    private(set) var base: [PetLayer] = []
    private(set) var items: [String: [PetLayer]] = [:]
    private(set) var images: [String: CGImage] = [:]

    func load(from root: URL, completion: @escaping () -> Void) {
        let session = URLSession(configuration: .ephemeral)
        session.dataTask(with: root.appendingPathComponent("sprites/manifest.json")) { data, _, _ in
            guard let data, let m = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            func layers(_ raw: Any?) -> [PetLayer] {
                (raw as? [[String: Any]] ?? []).compactMap { L in
                    guard let files = L["f"] as? [String: String], let z = L["z"] as? Int,
                          let anims = L["anims"] as? [String] else { return nil } // удары большим оружием на столе не нужны
                    return PetLayer(files: files, z: z, anims: anims)
                }
            }
            let base = layers(m["base"])
            var items: [String: [PetLayer]] = [:]
            for (id, raw) in m["items"] as? [String: Any] ?? [:] { items[id] = layers(raw) }
            let names = Set((base + items.values.flatMap { $0 }).flatMap { $0.files.values })
            var images: [String: CGImage] = [:]
            let lock = NSLock()
            let group = DispatchGroup()
            for name in names {
                group.enter()
                session.dataTask(with: root.appendingPathComponent("sprites/\(name).webp")) { data, _, _ in
                    defer { group.leave() }
                    guard let data, let src = CGImageSourceCreateWithData(data as CFData, nil),
                          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return }
                    lock.lock(); images[name] = img; lock.unlock()
                }.resume()
            }
            group.notify(queue: .main) {
                self.base = base
                self.items = items
                self.images = images
                completion()
            }
        }.resume()
    }
}

/// Что герой делает сейчас.
enum PetPose: Equatable {
    case walk(dir: Int) // -1 влево, 1 вправо
    case stand
    case lie
}

final class PetView: NSView {
    static let frame = 64
    static let scale: CGFloat = 2
    static let bubbleHeight: CGFloat = 40

    var sprites: PetSprites?
    var forma = "dryshch"
    var naryad: [String: String] = [:]
    var pose: PetPose = .stand
    var tick = 0
    var bubble: String?
    var onClick: (() -> Void)?

    private var dragStart: NSPoint?
    private var originStart: NSPoint = .zero
    private var dragged = false
    var isDragging: Bool { dragStart != nil && dragged }

    override var isFlipped: Bool { false }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        ctx.clear(bounds)
        ctx.interpolationQuality = .none
        let size = CGFloat(Self.frame) * Self.scale
        let spriteRect = NSRect(x: (bounds.width - size) / 2, y: 0, width: size, height: size)
        if let sprites {
            let (anim, row, col): (String, Int, Int) = {
                switch pose {
                case .lie: return ("hurt", 2, 5)
                case .stand: return ("walk", 0, 0)
                case .walk(let dir): return ("walk", dir < 0 ? 3 : 4, 1 + tick % 8)
                }
            }()
            var layers = sprites.base
            for id in naryad.values { layers += sprites.items[id] ?? [] }
            for L in layers.sorted(by: { $0.z < $1.z }) where L.anims.contains(anim) {
                guard let name = L.files[forma] ?? L.files["norma"], let img = sprites.images[name],
                      let cell = img.cropping(to: CGRect(x: col * Self.frame, y: row * Self.frame,
                                                         width: Self.frame, height: Self.frame)) else { continue }
                ctx.draw(cell, in: spriteRect)
            }
        }
        if let bubble { drawBubble(bubble, above: spriteRect) }
    }

    private func drawBubble(_ text: String, above sprite: NSRect) {
        let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.boldSystemFont(ofSize: 13), .foregroundColor: NSColor.black]
        let str = NSAttributedString(string: text, attributes: attrs)
        let ts = str.size()
        let box = NSRect(x: (bounds.width - ts.width) / 2 - 10, y: sprite.maxY - 30, width: ts.width + 20, height: ts.height + 12)
        let path = NSBezierPath(roundedRect: box, xRadius: 10, yRadius: 10)
        let tail = NSBezierPath()
        tail.move(to: NSPoint(x: box.midX - 6, y: box.minY + 1))
        tail.line(to: NSPoint(x: box.midX, y: box.minY - 8))
        tail.line(to: NSPoint(x: box.midX + 6, y: box.minY + 1))
        tail.close()
        NSColor.white.setFill()
        path.fill(); tail.fill()
        NSColor(white: 0.15, alpha: 1).setStroke()
        path.lineWidth = 1.5
        path.stroke()
        str.draw(at: NSPoint(x: box.minX + 10, y: box.minY + 6))
    }

    // MARK: мышь: перетаскивание и нажатия

    override func mouseDown(with event: NSEvent) {
        dragStart = NSEvent.mouseLocation
        originStart = window?.frame.origin ?? .zero
        dragged = false
    }

    override func mouseDragged(with event: NSEvent) {
        guard let start = dragStart, let window else { return }
        let now = NSEvent.mouseLocation
        let dx = now.x - start.x, dy = now.y - start.y
        if abs(dx) + abs(dy) > 3 { dragged = true }
        if dragged { window.setFrameOrigin(NSPoint(x: originStart.x + dx, y: originStart.y + dy)) }
    }

    override func mouseUp(with event: NSEvent) {
        let wasDrag = dragged
        dragStart = nil
        dragged = false
        if !wasDrag { onClick?() }
    }
}

/// Прозрачная панель без рамки: не становится главной и не забирает фокус.
final class PetPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class PetController {
    static let fps: Double = 8
    static let step: CGFloat = 3
    static let phrase = "Хули надо?"
    static let bubbleSeconds: TimeInterval = 4

    private let panel: PetPanel
    private let view: PetView
    private let sprites = PetSprites()
    private var timer: Timer?
    private var ticksLeft = 0
    private var resting = false
    private var bubbleUntil = Date.distantPast
    var onOpenStats: (() -> Void)?

    init(pageURL: URL) {
        let size = NSSize(width: 150, height: CGFloat(PetView.frame) * PetView.scale + PetView.bubbleHeight)
        panel = PetPanel(contentRect: NSRect(origin: .zero, size: size),
                         styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = false
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        view = PetView(frame: NSRect(origin: .zero, size: size))
        panel.contentView = view
        view.onClick = { [weak self] in self?.clicked() }

        let visible = (NSScreen.screens.first ?? NSScreen.main!).visibleFrame // экран со строкой меню
        panel.setFrameOrigin(NSPoint(x: visible.minX + visible.width * 0.6, y: visible.minY))
        panel.orderFrontRegardless()
        sprites.load(from: pageURL) { [weak self] in
            guard let self else { return }
            self.view.sprites = self.sprites
            self.view.needsDisplay = true
        }
        timer = Timer.scheduledTimer(withTimeInterval: 1 / Self.fps, repeats: true) { [weak self] _ in self?.tick() }
    }

    /// Новое состояние от бота: форма, шмот, нокаут, выходной.
    func update(_ state: [String: Any]) {
        if let f = state["forma"] as? String { view.forma = f }
        var n: [String: String] = [:]
        for (slot, id) in state["naryad"] as? [String: Any] ?? [:] { if let id = id as? String { n[slot] = id } }
        view.naryad = n
        let saturday = Calendar.current.component(.weekday, from: Date()) == 7
        resting = (state["nokaut"] as? Bool ?? false) || (state["vyhodnoy"] as? Bool ?? false) || saturday
        // проверка прогулки в выходной: GROM_PET_WALK=1 ~/Applications/Grom.app/Contents/MacOS/Grom
        if ProcessInfo.processInfo.environment["GROM_PET_WALK"] == "1", !(state["nokaut"] as? Bool ?? false) { resting = false }
        view.needsDisplay = true
    }

    private func clicked() {
        if Date() < bubbleUntil {
            bubbleUntil = .distantPast
            view.bubble = nil
            view.needsDisplay = true
            onOpenStats?()
        } else {
            bubbleUntil = Date().addingTimeInterval(Self.bubbleSeconds)
            view.bubble = Self.phrase
            view.needsDisplay = true
        }
    }

    private func tick() {
        var changed = false
        if view.bubble != nil, Date() >= bubbleUntil { view.bubble = nil; changed = true }
        if resting {
            if view.pose != .lie { view.pose = .lie; changed = true }
        } else if view.isDragging {
            if view.pose != .stand { view.pose = .stand; changed = true }
        } else {
            changed = move() || changed
        }
        if changed { view.needsDisplay = true }
    }

    /// Шаг прогулки. Возвращает true, если кадр поменялся.
    private func move() -> Bool {
        if ticksLeft <= 0 {
            // по очереди: идёт 3–8 с, стоит 2–6 с
            if case .walk = view.pose {
                view.pose = .stand
                ticksLeft = Int(Double.random(in: 2...6) * Self.fps)
            } else {
                view.pose = .walk(dir: Bool.random() ? 1 : -1)
                ticksLeft = Int(Double.random(in: 3...8) * Self.fps)
            }
            return true
        }
        ticksLeft -= 1
        guard case .walk(var dir) = view.pose else { return false }
        let screen = panel.screen ?? NSScreen.main ?? NSScreen.screens[0]
        let bounds = screen.visibleFrame
        var origin = panel.frame.origin
        origin.x += CGFloat(dir) * Self.step
        if origin.x < bounds.minX || origin.x + panel.frame.width > bounds.maxX {
            dir = -dir
            origin.x = min(max(origin.x, bounds.minX), bounds.maxX - panel.frame.width)
        }
        panel.setFrameOrigin(origin)
        view.pose = .walk(dir: dir)
        view.tick += 1
        return true
    }
}
