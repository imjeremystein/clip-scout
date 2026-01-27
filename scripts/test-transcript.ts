// Test direct caption fetching from YouTube

async function getTranscript(videoId: string) {
  // First get the video page to find caption tracks
  const pageResponse = await fetch('https://www.youtube.com/watch?v=' + videoId);
  const html = await pageResponse.text();

  // Look for captions URL in the page
  const captionMatch = html.match(/"captions":\{"playerCaptionsTracklistRenderer":\{"captionTracks":(\[.*?\])/);

  if (!captionMatch) {
    console.log('No captions found in page');
    return null;
  }

  try {
    const tracks = JSON.parse(captionMatch[1]);
    console.log('Found', tracks.length, 'caption tracks');

    if (tracks.length > 0) {
      // Get the first English track or first available
      const track = tracks.find((t: any) => t.languageCode === 'en') || tracks[0];
      console.log('Using track:', track.languageCode, track.name?.simpleText || '');

      // Fetch the captions - add format for JSON
      let captionUrl = track.baseUrl;
      // Try adding fmt=json3 for JSON format
      captionUrl += '&fmt=json3';
      console.log('Caption URL:', captionUrl.slice(0, 150) + '...');
      const captionResponse = await fetch(captionUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      console.log('Response status:', captionResponse.status);
      const captionText = await captionResponse.text();
      console.log('Caption text length:', captionText.length);
      console.log('First 500 chars:', captionText.slice(0, 500));

      const segments: Array<{start: number, dur: number, text: string}> = [];

      // Try parsing as JSON (fmt=json3 format)
      try {
        const json = JSON.parse(captionText);
        if (json.events) {
          for (const event of json.events) {
            if (event.segs) {
              const text = event.segs.map((s: any) => s.utf8).join('');
              if (text.trim()) {
                segments.push({
                  start: (event.tStartMs || 0) / 1000,
                  dur: (event.dDurationMs || 0) / 1000,
                  text: text.trim()
                });
              }
            }
          }
        }
      } catch (e) {
        // Fall back to XML parsing
        const regex = /<text[^>]*start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([^<]*)<\/text>/g;
        let match;
        while ((match = regex.exec(captionText)) !== null) {
          segments.push({
            start: parseFloat(match[1]),
            dur: parseFloat(match[2]),
            text: match[3]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
          });
        }
      }

      return segments;
    }
  } catch (e: any) {
    console.log('Parse error:', e.message);
  }

  return null;
}

async function test() {
  // Test with a video known to have captions
  const videoId = 'kJQP7kiw5Fk'; // Despacito
  console.log('Testing video:', videoId);

  const transcript = await getTranscript(videoId);
  if (transcript) {
    console.log('Got', transcript.length, 'segments');
    console.log('First 3:', transcript.slice(0, 3));
  } else {
    console.log('No transcript found');
  }
}

test().catch(console.error);
