import AppKit

/// Бой героя на рабочем столе – та же раскладка, что на странице (hero.js):
/// противник входит справа, герой трижды бьёт вправо («БАМ!», «−100»), противник улетает,
/// герой стоит победителем с облачком. Герой не падает никогда. Противники свои (tools/enemies.py).
struct PetFight {
    static let enemies = ["cherepaha", "kapitan"]
    static let enter = 0.7, hit = 0.6, fly = 0.8, win = 1.2
    static var total: Double { enter + 3 * hit + fly + win }
    static let heroX: CGFloat = 40
    static let enemyGap: CGFloat = 76 // противник правее героя, в точках
    static let pops = ["БАМ!", "−100", "БАМ!"]
    static let victory = "Получай, сука!"

    let vrag: String
    let start = Date()
    var elapsed: Double { Date().timeIntervalSince(start) }
    var finished: Bool { elapsed >= Self.total }
}

extension PetView {
    /// Кадр боя по времени от начала.
    func drawFight(_ ctx: CGContext, sprites: PetSprites) {
        guard let fight else { return }
        let t = fight.elapsed
        let hero = heroRect
        let s = Self.scale
        let f = CGFloat(Self.frame)
        let hitsEnd = PetFight.enter + 3 * PetFight.hit
        var heroAnim = ("walk", 0, 0) // (анимация, строка, кадр)
        var east = false
        var enemy: (frame: Int, x: CGFloat, y: CGFloat)? = (Int(t / 0.3) % 2, hero.minX + PetFight.enemyGap, 0)
        var pop: (String, Double)?
        var say = false

        if t < PetFight.enter {
            let k = CGFloat(t / PetFight.enter)
            enemy!.x = bounds.maxX - (bounds.maxX - enemy!.x) * k
        } else if t < hitsEnd {
            let k = Int((t - PetFight.enter) / PetFight.hit)
            let inHit = (t - PetFight.enter).truncatingRemainder(dividingBy: PetFight.hit)
            heroAnim = ("slash", 6, min(5, Int(inHit / 0.1)))
            east = true
            if inHit >= 0.3 {
                enemy!.frame = 2 + k % 2
                enemy!.x += 2 * s
                pop = (PetFight.pops[k], (inHit - 0.3) / 0.3)
            }
        } else if t < hitsEnd + PetFight.fly {
            let k = (t - hitsEnd) / PetFight.fly
            heroAnim = ("slash", 6, 5)
            east = true
            enemy!.frame = 4 + min(2, Int(k * 3))
            enemy!.x += CGFloat(k) * 180
            enemy!.y = CGFloat(sin(k * .pi)) * 50 + CGFloat(k) * 20
        } else {
            enemy = nil
            say = true
        }

        // герой: обычные слои и удар большим оружием (строка «вправо» его полосы)
        var layers = sprites.base
        if pose == .relax { layers += sprites.extra["ochki"] ?? [] }
        for id in naryad.values { layers += sprites.items[id] ?? [] }
        for L in layers.sorted(by: { $0.z < $1.z }) {
            guard let name = L.files[forma] ?? L.files["norma"], let img = sprites.images[name] else { continue }
            if let size = L.slash {
                guard heroAnim.0 == "slash", east,
                      let cell = img.cropping(to: CGRect(x: heroAnim.2 * size, y: size, width: size, height: size)) else { continue }
                let side = CGFloat(size) * s
                ctx.draw(cell, in: NSRect(x: hero.midX - side / 2, y: hero.midY - side / 2, width: side, height: side))
                continue
            }
            guard L.anims.contains(heroAnim.0),
                  let cell = img.cropping(to: CGRect(x: heroAnim.2 * Self.frame, y: heroAnim.1 * Self.frame,
                                                     width: Self.frame, height: Self.frame)) else { continue }
            ctx.draw(cell, in: hero)
        }

        if let e = enemy, let img = sprites.images["vrag_\(fight.vrag)"],
           let cell = img.cropping(to: CGRect(x: e.frame * Self.frame, y: 0, width: Self.frame, height: Self.frame)) {
            ctx.draw(cell, in: NSRect(x: e.x, y: e.y, width: f * s, height: f * s))
        }
        if let (text, k) = pop, let e = enemy {
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 20, weight: .black),
                .foregroundColor: NSColor(red: 1, green: 0.82, blue: 0.25, alpha: 1),
                .strokeColor: NSColor(red: 0.23, green: 0.11, blue: 0, alpha: 1),
                .strokeWidth: -4,
            ]
            NSAttributedString(string: text, attributes: attrs)
                .draw(at: NSPoint(x: e.x + 40, y: f * s - 30 + CGFloat(k) * 16))
        }
        if say { drawBubble(PetFight.victory, above: hero) }
    }

    // MARK: правый клик – меню героя

    override func menu(for event: NSEvent) -> NSMenu? {
        let m = NSMenu()
        m.addItem(withTitle: "Бой", action: #selector(menuFight), keyEquivalent: "").target = self
        m.addItem(withTitle: "Окно «Гром»", action: #selector(menuStats), keyEquivalent: "").target = self
        m.addItem(.separator())
        m.addItem(withTitle: "Выйти", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
        return m
    }

    @objc private func menuFight() { onFightMenu?() }
    @objc private func menuStats() { onStatsMenu?() }
}
