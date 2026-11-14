import Foundation

/// Обмен с ботом «Гром» на claude-vps по ssh (как в приложении «Задачи»: BatchMode, без пароля, с таймаутом).
/// Состояние – `grom-bot/data/state.json`, действия – строкой в `grom-bot/data/ochered.jsonl`. Формат – KONTRAKT.md бота.
enum Server {
    static let host = "claude-vps"
    static let readCommand = "cat grom-bot/data/state.json"
    static let appendCommand = "cat >> grom-bot/data/ochered.jsonl"
    static let connectTimeout = 8
    /// Заход дольше этого снимаем: зависший ssh не должен держать обновления.
    static let runTimeout: TimeInterval = 25
    static let maxActionBytes = 200

    struct Failure: Error, CustomStringConvertible {
        let description: String
    }

    /// Запустить ssh с постоянной командой; данные идут только через stdin, в команду ничего не подставляется.
    static func ssh(_ command: String, input: Data? = nil) -> Result<Data, Failure> {
        signal(SIGPIPE, SIG_IGN)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ssh")
        process.arguments = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=\(connectTimeout)",
                             "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", host, command]
        let inPipe = Pipe()
        let out = Pipe()
        let err = Pipe()
        process.standardInput = inPipe
        process.standardOutput = out
        process.standardError = err
        do {
            try process.run()
        } catch {
            return .failure(Failure(description: "ssh не запустился: \(error.localizedDescription)"))
        }
        DispatchQueue.global(qos: .utility).async {
            if let input { try? inPipe.fileHandleForWriting.write(contentsOf: input) }
            try? inPipe.fileHandleForWriting.close()
        }
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + runTimeout) {
            if process.isRunning { process.terminate() }
        }
        let output = out.fileHandleForReading.readDataToEndOfFile()
        let errorData = err.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let reason = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return .failure(Failure(description: "код \(process.terminationStatus) \(reason)"))
        }
        return .success(output)
    }

    /// Прочитать state.json и вернуть его заново сериализованным JSON-объектом (безопасно вставлять в JS).
    static func readState() -> Result<String, Failure> {
        switch ssh(readCommand) {
        case .failure(let error):
            return .failure(error)
        case .success(let data):
            guard let object = try? JSONSerialization.jsonObject(with: data),
                  object is [String: Any],
                  let clean = try? JSONSerialization.data(withJSONObject: object),
                  let text = String(data: clean, encoding: .utf8) else {
                return .failure(Failure(description: "state.json пустой или не JSON"))
            }
            return .success(text)
        }
    }

    /// Проверка действия со страницы: JSON-объект с полем "a", до 200 байт, одной строкой.
    static func validAction(_ raw: String) -> Bool {
        let bytes = Data(raw.utf8)
        guard bytes.count <= maxActionBytes, !raw.contains("\n"), !raw.contains("\r"),
              let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              object["a"] is String else { return false }
        return true
    }

    /// Дописать одно действие строкой в очередь бота.
    static func append(_ raw: String) -> Result<Void, Failure> {
        guard validAction(raw) else { return .failure(Failure(description: "действие не прошло проверку")) }
        return ssh(appendCommand, input: Data((raw + "\n").utf8)).map { _ in () }
    }
}
