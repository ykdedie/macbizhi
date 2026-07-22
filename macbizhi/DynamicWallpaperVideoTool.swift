import SwiftUI
import AVKit
import AppKit
import CoreGraphics

struct VideoItem: Identifiable, Hashable {
    let url: URL
    var id: String { url.path }
    var name: String { url.lastPathComponent }
}

@MainActor
final class ToolModel: ObservableObject {
    @Published var videos: [VideoItem] = []
    @Published var selectedVideo: VideoItem?
    @Published var status = "正在读取视频目录…"
    @Published var isDownloading = false

    let videoDirectory: URL
    private let urlFile: URL

    init() {
        videoDirectory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Movies/动态壁纸视频工具", isDirectory: true)
        urlFile = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Downloads/video_urls.txt")
        do {
            try FileManager.default.createDirectory(
                at: videoDirectory,
                withIntermediateDirectories: true
            )
        } catch {
            status = "无法创建视频目录：\(chineseErrorMessage(error))"
        }
        reloadVideos()
    }

    func reloadVideos(message: String? = nil) {
        let keys: [URLResourceKey] = [.fileSizeKey]
        let files = (try? FileManager.default.contentsOfDirectory(
            at: videoDirectory,
            includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles]
        )) ?? []
        videos = files
            .filter { $0.pathExtension.lowercased() == "mp4" && $0.lastPathComponent.hasPrefix("video_1440p_") }
            .sorted { videoIndex($0) < videoIndex($1) }
            .map(VideoItem.init)
        status = message ?? "已下载 \(videos.count) 个视频"
    }

    private func videoIndex(_ url: URL) -> Int {
        let name = url.deletingPathExtension().lastPathComponent
        return Int(name.split(separator: "_").last ?? "") ?? Int.max
    }

    func downloadVideos() {
        guard !isDownloading else { return }
        isDownloading = true
        status = "正在下载，请保持应用开启…"
        let directory = videoDirectory
        let sourceFile = urlFile

        Task {
            do {
                let text = try String(contentsOf: sourceFile, encoding: .utf8)
                let urls = text.split(whereSeparator: \ .isNewline).map(String.init).filter { !$0.isEmpty }
                guard !urls.isEmpty else { throw ToolError.message("video_urls.txt 中没有链接") }

                for (offset, string) in urls.enumerated() {
                    guard let url = URL(string: string) else { continue }
                    var request = URLRequest(url: url)
                    request.timeoutInterval = 60
                    request.setValue("https://www.douyin.com/", forHTTPHeaderField: "Referer")
                    request.setValue(
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0 Safari/537.36",
                        forHTTPHeaderField: "User-Agent"
                    )
                    request.setValue("bytes=0-", forHTTPHeaderField: "Range")
                    let (temporary, response) = try await URLSession.shared.download(for: request)
                    guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                        throw ToolError.message("第 \(offset + 1) 个视频下载失败")
                    }
                    let target = directory.appendingPathComponent("video_1440p_\(offset + 1).mp4")
                    try? FileManager.default.removeItem(at: target)
                    try FileManager.default.moveItem(at: temporary, to: target)
                    status = "已下载 \(offset + 1)/\(urls.count)"
                }
                reloadVideos(message: "全部下载完成，共 \(urls.count) 个视频")
            } catch {
                status = "下载失败：\(chineseErrorMessage(error))"
            }
            isDownloading = false
        }
    }

    func setWallpaper(_ item: VideoItem) {
        do {
            try WallpaperController.shared.setVideo(item.url)
            status = "已设为桌面动态壁纸：\(item.name)"
        } catch {
            status = "设置失败：\(chineseErrorMessage(error))"
        }
    }
}

func chineseErrorMessage(_ error: Error) -> String {
    if let toolError = error as? ToolError, let message = toolError.errorDescription {
        return message
    }
    if let urlError = error as? URLError {
        switch urlError.code {
        case .timedOut: return "连接超时，请重新获取链接后再试"
        case .notConnectedToInternet: return "网络未连接"
        case .cannotFindHost: return "找不到视频服务器"
        case .cannotConnectToHost: return "无法连接视频服务器"
        case .networkConnectionLost: return "下载过程中网络连接中断"
        case .badURL, .unsupportedURL: return "视频链接格式不正确"
        case .userAuthenticationRequired: return "链接需要登录或已经失效"
        case .resourceUnavailable, .fileDoesNotExist: return "视频资源不存在或链接已经过期"
        case .noPermissionsToReadFile: return "没有读取文件的权限"
        default: return "网络请求失败（错误代码 \(urlError.errorCode)）"
        }
    }
    let nsError = error as NSError
    if nsError.domain == NSCocoaErrorDomain {
        switch nsError.code {
        case NSFileNoSuchFileError: return "找不到所需文件"
        case NSFileReadNoPermissionError: return "没有读取文件的权限"
        case NSFileWriteNoPermissionError: return "没有保存文件的权限"
        case NSFileWriteOutOfSpaceError: return "磁盘空间不足"
        default: return "文件操作失败（错误代码 \(nsError.code)）"
        }
    }
    return "操作未能完成（错误代码 \(nsError.code)）"
}

enum ToolError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        if case .message(let text) = self { return text }
        return "未知错误"
    }
}

@MainActor
final class WallpaperController {
    static let shared = WallpaperController()
    private var sessions: [WallpaperSession] = []

    func setVideo(_ url: URL) throws {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw ToolError.message("视频文件不存在")
        }
        let screens = NSScreen.screens
        if sessions.count != screens.count {
            // 只在显示器数量变化时重建；普通的视频切换不触碰窗口生命周期。
            sessions.forEach { $0.hide() }
            sessions.removeAll()
            sessions = screens.map { WallpaperSession(screen: $0, videoURL: url) }
        } else {
            for (session, screen) in zip(sessions, screens) {
                session.updateFrame(for: screen)
                session.replaceVideo(with: url)
            }
        }
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@MainActor
final class WallpaperSession {
    private let window: NSWindow
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?

    init(screen: NSScreen, videoURL: URL) {
        window = NSWindow(
            contentRect: screen.frame,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false,
            screen: screen
        )
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        window.ignoresMouseEvents = true
        window.isOpaque = true
        window.backgroundColor = .black
        window.hasShadow = false
        window.animationBehavior = .none

        player.isMuted = true
        let view = PlayerLayerView(frame: NSRect(origin: .zero, size: screen.frame.size))
        view.autoresizingMask = [.width, .height]
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        window.contentView = view
        window.setFrame(screen.frame, display: true)
        replaceVideo(with: videoURL)
        window.orderFrontRegardless()
    }

    func replaceVideo(with url: URL) {
        player.pause()
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()
        let item = AVPlayerItem(url: url)
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.play()
    }

    func updateFrame(for screen: NSScreen) {
        window.setFrame(screen.frame, display: true, animate: false)
        window.orderFrontRegardless()
    }

    func hide() {
        player.pause()
        looper?.disableLooping()
        window.orderOut(nil)
    }
}

final class PlayerLayerView: NSView {
    let playerLayer = AVPlayerLayer()
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer = playerLayer
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

struct ThumbnailView: View {
    let url: URL
    @State private var image: NSImage?
    var body: some View {
        ZStack {
            Color.black
            if let image { Image(nsImage: image).resizable().scaledToFill() }
            else { ProgressView().controlSize(.small) }
        }
        .aspectRatio(16/9, contentMode: .fit)
        .clipped()
        .task(id: url) {
            let asset = AVURLAsset(url: url)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 720, height: 405)
            if let cgImage = try? generator.copyCGImage(at: CMTime(seconds: 0.2, preferredTimescale: 600), actualTime: nil) {
                image = NSImage(cgImage: cgImage, size: .zero)
            }
        }
    }
}

struct PreviewView: View {
    let item: VideoItem
    let setWallpaper: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer

    init(item: VideoItem, setWallpaper: @escaping () -> Void) {
        self.item = item
        self.setWallpaper = setWallpaper
        _player = State(initialValue: AVPlayer(url: item.url))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(item.name).font(.headline)
                Spacer()
                Button("设为桌面动态壁纸") { setWallpaper() }.buttonStyle(.borderedProminent)
                Button("关闭") { dismiss() }
            }.padding()
            VideoPlayer(player: player).background(Color.black)
        }
        .frame(minWidth: 900, minHeight: 620)
        .onAppear { player.play() }
        .onDisappear { player.pause() }
    }
}

struct ContentView: View {
    @StateObject private var model = ToolModel()
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 18), count: 3)

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("动态壁纸视频工具").font(.title2.bold())
                    Text("下载 · 三列预览 · 桌面动态壁纸").foregroundStyle(.secondary)
                }
                Spacer()
                Button(model.isDownloading ? "正在下载…" : "下载视频") { model.downloadVideos() }
                    .buttonStyle(.borderedProminent).disabled(model.isDownloading)
                Button("刷新") { model.reloadVideos() }
            }.padding(20)
            Divider()
            Text(model.status).foregroundStyle(.secondary).padding(.vertical, 10)
            ScrollView {
                if model.videos.isEmpty {
                    ContentUnavailableView("还没有视频", systemImage: "film", description: Text("点击右上角“下载视频”"))
                        .frame(maxWidth: .infinity, minHeight: 420)
                } else {
                    LazyVGrid(columns: columns, spacing: 18) {
                        ForEach(model.videos) { item in
                            Button { model.selectedVideo = item } label: {
                                VStack(alignment: .leading, spacing: 0) {
                                    ThumbnailView(url: item.url)
                                    Text(item.name).lineLimit(1).padding(11)
                                }
                                .background(.quaternary.opacity(0.35))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }.buttonStyle(.plain)
                        }
                    }.padding(20)
                }
            }
        }
        .frame(minWidth: 1020, minHeight: 700)
        .sheet(item: $model.selectedVideo) { item in
            PreviewView(item: item) { model.setWallpaper(item) }
        }
    }
}

@main
struct DynamicWallpaperVideoToolApp: App {
    var body: some Scene {
        WindowGroup("动态壁纸视频工具") { ContentView() }
            .windowStyle(.titleBar)
            .defaultSize(width: 1180, height: 780)
    }
}
