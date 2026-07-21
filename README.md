# 动态壁纸视频工具

这是一个面向 macOS 的抖音动态壁纸工具。它可以从抖音网页提取所选视频的高清地址，下载视频，在原生 macOS 应用中预览，并把视频静音循环播放为桌面动态壁纸。

## 下载

[下载最新版 macOS 安装包（DMG）](https://github.com/ykdedie/macbizhi/releases/latest/download/DynamicWallpaperVideoTool.dmg)

项目地址：[ykdedie/macbizhi](https://github.com/ykdedie/macbizhi)

> 当前仓库尚未发布 Release。创建 Release 并上传名为 `DynamicWallpaperVideoTool.dmg` 的安装包后，上面的直接下载按钮即可使用。

## 系统要求

- Apple Silicon Mac（M1、M2、M3、M4 或更新芯片）
- macOS 14.0 或更高版本
- 可以正常访问抖音网页的浏览器

## 文件说明

| 文件 | 功能 |
| --- | --- |
| `DynamicWallpaperVideoTool.dmg` | 安装镜像。打开后把应用拖入“应用程序”文件夹即可安装。 |
| `DynamicWallpaperVideoTool.swift` | macOS 应用的 SwiftUI 源代码。 |
| `dy_extract_hd_urls.js` | 抖音网页辅助脚本，用来监听视频接口、选择视频并生成 `video_urls.txt`。 |
| `down_video.py` | 可选的 Python 命令行下载器；正常使用图形应用时不需要运行。 |
| `video_1440p_*.mp4` | 项目中已有的视频样例，不会随 DMG 安装到系统中。 |
| `README.md` | 项目说明和使用教程。 |

## 安装应用

1. 下载并双击 `DynamicWallpaperVideoTool.dmg`。
2. 在打开的窗口中，将“动态壁纸视频工具”拖到“Applications（应用程序）”文件夹。
3. 在 Finder 的“应用程序”中打开“动态壁纸视频工具”。
4. 如果 macOS 首次运行时提示无法验证开发者，请在应用上点右键，选择“打开”，然后再次确认。该安装包使用本机临时签名，没有 Apple Developer ID 公证。

应用会自动创建以下视频目录：

```text
~/Movies/动态壁纸视频工具/
```

## 完整使用步骤

### 第一步：在抖音网页提取视频链接

1. 使用浏览器打开抖音网页版，并进入视频列表或搜索结果页面。
2. 打开浏览器开发者工具中的 Console（控制台）。
3. 打开项目中的 `dy_extract_hd_urls.js`，复制全部内容，粘贴到控制台并执行。
4. 正常浏览或滚动页面，让脚本捕获视频数据。网页右下角会出现“抖音高清提取器”面板。
5. 按 `Command + Shift + A`，或者点击面板中的“开始选择”。
6. 单击想要下载的视频卡片，可以连续选择多个视频。
7. 再按一次 `Command + Shift + A`，或者点击“完成并下载”。
8. 脚本匹配成功后，浏览器会下载 `video_urls.txt`。

请确保文件最终位于：

```text
~/Downloads/video_urls.txt
```

如果浏览器自动给文件名添加了序号，例如 `video_urls (1).txt`，请将它改回 `video_urls.txt`。

### 第二步：下载视频

1. 打开“动态壁纸视频工具”。
2. 点击右上角的“下载视频”。
3. 应用逐行读取 `~/Downloads/video_urls.txt` 中的地址，并显示下载进度。
4. 下载完成的视频会保存为：

```text
~/Movies/动态壁纸视频工具/video_1440p_1.mp4
~/Movies/动态壁纸视频工具/video_1440p_2.mp4
...
```

重新下载时，同名编号的视频会被覆盖。抖音视频地址可能过期；如果下载失败，请重新执行第一步获取链接。

### 第三步：设置动态壁纸

1. 下载完成后，应用会以三列缩略图展示视频。
2. 单击缩略图进入视频预览。
3. 点击“设为桌面动态壁纸”。
4. 应用会在所有已连接的显示器上静音、循环播放该视频，并自动裁切填满屏幕。

动态壁纸由应用窗口播放，因此需要保持应用运行。退出应用后动态壁纸会停止。

## 使用已有本地视频

如果已经有 MP4 视频，可以直接复制到：

```text
~/Movies/动态壁纸视频工具/
```

文件名必须采用 `video_1440p_数字.mp4` 格式，例如：

```text
video_1440p_1.mp4
video_1440p_2.mp4
```

复制完成后，在应用中点击“刷新”。

## 可选：使用 Python 下载

`down_video.py` 是备用下载方式，需要 Python 3 和 `requests`：

```bash
python3 -m pip install requests
python3 down_video.py
```

运行前，需要把 `video_urls.txt` 放在当前命令行目录。视频也会保存到当前目录。日常使用建议直接点击应用中的“下载视频”。

## 常见问题

- **应用中没有视频**：确认文件位于 `~/Movies/动态壁纸视频工具/`，名称符合 `video_1440p_数字.mp4`，然后点击“刷新”。
- **提示找不到所需文件**：确认 `~/Downloads/video_urls.txt` 存在且文件名正确。
- **下载超时或资源不存在**：抖音地址可能已经失效，请重新提取。
- **网页脚本匹配不到视频**：先滚动或播放目标视频，让对应网络接口被加载；抖音网页结构更新后，脚本也可能需要调整。
- **动态壁纸停止**：确认应用仍在运行。该工具不是修改系统静态壁纸，而是在桌面层循环播放视频。

## 隐私说明

应用只读取 `~/Downloads/video_urls.txt`，并将视频写入 `~/Movies/动态壁纸视频工具/`。网页辅助脚本在当前抖音页面内运行，用于读取页面已经加载的视频数据，不会上传选择记录到本项目自己的服务器。
