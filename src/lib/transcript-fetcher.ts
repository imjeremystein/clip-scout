/**
 * Manual YouTube transcript fetcher that works with Node 18
 */

import https from 'https';

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

interface TranscriptResult {
  segments: TranscriptSegment[];
  fullText: string;
  source: 'YOUTUBE_API' | 'AUTOGEN' | 'THIRD_PARTY';
}

function httpsGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
        'Referer': 'https://www.youtube.com/',
        ...headers,
      },
    };

    const req = https.get(options, (res) => {
      // Handle redirects
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          httpsGet(redirectUrl, headers).then(resolve).catch(reject);
          return;
        }
      }

      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptResult | null> {
  try {
    // Fetch the video page
    const pageHtml = await httpsGet(`https://www.youtube.com/watch?v=${videoId}`);

    // Extract player response JSON
    const playerResponseMatch = pageHtml.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!playerResponseMatch) {
      console.log(`[Transcript] No player response found for ${videoId}`);
      return null;
    }

    let playerResponse;
    try {
      playerResponse = JSON.parse(playerResponseMatch[1]);
    } catch {
      console.log(`[Transcript] Failed to parse player response for ${videoId}`);
      return null;
    }

    // Get caption tracks
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      console.log(`[Transcript] No caption tracks found for ${videoId}`);
      return null;
    }

    // Find English track or use first available
    const track = captionTracks.find((t: any) => t.languageCode === 'en') ||
                  captionTracks.find((t: any) => t.languageCode?.startsWith('en')) ||
                  captionTracks[0];

    if (!track?.baseUrl) {
      console.log(`[Transcript] No valid caption track URL for ${videoId}`);
      return null;
    }

    // Fetch the captions XML
    console.log(`[Transcript] Fetching captions from: ${track.baseUrl.slice(0, 100)}...`);
    const captionsXml = await httpsGet(track.baseUrl);

    console.log(`[Transcript] Captions response length: ${captionsXml.length}`);
    if (captionsXml.length > 0 && captionsXml.length < 500) {
      console.log(`[Transcript] Response content: ${captionsXml}`);
    }

    if (!captionsXml || captionsXml.length < 50) {
      console.log(`[Transcript] Empty captions response for ${videoId}`);
      return null;
    }

    // Parse XML captions
    const segments: TranscriptSegment[] = [];
    const textRegex = /<text[^>]*start="([\d.]+)"[^>]*dur="([\d.]+)"[^>]*>([^<]*)<\/text>/g;
    let match;

    while ((match = textRegex.exec(captionsXml)) !== null) {
      const text = decodeHtmlEntities(match[3]);
      if (text.trim()) {
        segments.push({
          start: parseFloat(match[1]),
          duration: parseFloat(match[2]),
          text: text.trim(),
        });
      }
    }

    if (segments.length === 0) {
      console.log(`[Transcript] No segments parsed for ${videoId}`);
      return null;
    }

    const fullText = segments.map((s) => s.text).join(' ');
    console.log(`[Transcript] Got ${segments.length} segments for ${videoId}`);

    return {
      segments,
      fullText,
      source: 'YOUTUBE_API',
    };
  } catch (error) {
    console.error(`[Transcript] Error fetching transcript for ${videoId}:`, error);
    return null;
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\n/g, ' ');
}
