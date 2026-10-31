import sys
import json
from ytmusicapi import YTMusic

def resolve(artist, title):
    yt = YTMusic()
    query = f"{artist} {title}".strip()
    try:
        results = yt.search(query, filter="songs", limit=5)
        if not results:
            # Fallback to general search
            results = yt.search(query, limit=5)
        
        for item in results:
            vid = item.get("videoId")
            if vid:
                return {
                    "videoId": vid,
                    "title": item.get("title"),
                    "artist": item.get("artists", [{}])[0].get("name", artist) if item.get("artists") else artist,
                    "album": item.get("album", {}).get("name", "") if item.get("album") else ""
                }
    except Exception as e:
        return {"error": str(e)}
    return None

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing artist or title"}))
        sys.exit(1)
    
    artist_arg = sys.argv[1]
    title_arg = sys.argv[2]
    result = resolve(artist_arg, title_arg)
    print(json.dumps(result or {}))
