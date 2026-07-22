import requests


with open('video_urls.txt','r') as f:
    video_urls = f.readlines()

headers = {
    "Referer": "https://www.douyin.com/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 Chrome/138.0 Safari/537.36"
    ),
    "Range": "bytes=0-",
}

for url in video_urls:
    index = video_urls.index(url) + 1

    res = requests.get(url, headers=headers, timeout=60)
    res.raise_for_status()

    with open(f"video_1440p_{index}.mp4", "wb") as file:
        file.write(res.content)
        print(f'保存到第{index}个视频')