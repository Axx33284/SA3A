// Now Playing: reads every media session Windows knows about (Spotify, YouTube in
// Chrome/Edge/Firefox, YouTube Music, Media Player, Movies & TV, VLC 4 ...) through
// Global System Media Transport Controls, and sends play/pause/skip/seek to them.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace IslandHelper
{
    internal sealed class MediaMonitor
    {
        GlobalSystemMediaTransportControlsSessionManager _mgr;
        readonly object _lock = new object();
        readonly Dictionary<string, Dictionary<string, object>> _props = new Dictionary<string, Dictionary<string, object>>();
        readonly Dictionary<string, string> _thumbKeys = new Dictionary<string, string>();
        readonly HashSet<GlobalSystemMediaTransportControlsSession> _hooked = new HashSet<GlobalSystemMediaTransportControlsSession>();
        string _last = "";
        Timer _poll;
        int _tick;

        public void Start()
        {
            _mgr = GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask().GetAwaiter().GetResult();
            _mgr.SessionsChanged += (s, e) => Refresh(true);
            _mgr.CurrentSessionChanged += (s, e) => Refresh(false);
            Refresh(true);
            // Events are not fired reliably by every app (browsers especially), so also poll.
            _poll = new Timer(_ => { try { _tick++; Refresh(_tick % 3 == 0); } catch (Exception ex) { Program.Log("media poll: " + ex.Message); } }, null, 1000, 1000);
        }

        static string Id(GlobalSystemMediaTransportControlsSession s, int index)
        {
            var id = s.SourceAppUserModelId ?? "unknown";
            return index == 0 ? id : id + "#" + index;
        }

        IReadOnlyList<GlobalSystemMediaTransportControlsSession> Sessions()
        {
            try { return _mgr.GetSessions(); } catch { return new GlobalSystemMediaTransportControlsSession[0]; }
        }

        void Refresh(bool reloadProps)
        {
            if (_mgr == null) return;
            var sessions = Sessions();
            foreach (var s in sessions)
            {
                lock (_lock)
                {
                    if (!_hooked.Contains(s))
                    {
                        _hooked.Add(s);
                        s.MediaPropertiesChanged += (a, b) => LoadProps(a, true);
                        s.PlaybackInfoChanged += (a, b) => Emit(false);
                        s.TimelinePropertiesChanged += (a, b) => Emit(false);
                        reloadProps = true;
                    }
                }
                if (reloadProps) LoadProps(s, false);
            }
            Emit(false);
        }

        void LoadProps(GlobalSystemMediaTransportControlsSession s, bool emit)
        {
            Task.Run(async () =>
            {
                try
                {
                    var p = await s.TryGetMediaPropertiesAsync();
                    if (p == null) return;
                    var d = new Dictionary<string, object>
                    {
                        { "title", p.Title ?? "" },
                        { "artist", p.Artist ?? "" },
                        { "album", p.AlbumTitle ?? "" },
                        { "albumArtist", p.AlbumArtist ?? "" },
                        { "track", p.TrackNumber },
                        { "kind", p.PlaybackType.HasValue ? p.PlaybackType.Value.ToString().ToLowerInvariant() : "unknown" }
                    };
                    string key = s.SourceAppUserModelId + "|" + p.Title + "|" + p.Artist + "|" + p.AlbumTitle;
                    string thumbKey = null;
                    if (p.Thumbnail != null)
                    {
                        thumbKey = ((uint)key.GetHashCode()).ToString("x8");
                        bool known;
                        lock (_lock) known = _thumbKeys.ContainsValue(thumbKey);
                        if (!known)
                        {
                            var data = await ReadImage(p.Thumbnail);
                            if (data != null)
                                Program.Send(new Dictionary<string, object> { { "type", "thumb" }, { "key", thumbKey }, { "data", data } });
                            else thumbKey = null;
                        }
                    }
                    d["thumb"] = thumbKey;
                    lock (_lock)
                    {
                        _props[s.SourceAppUserModelId ?? "unknown"] = d;
                        if (thumbKey != null) _thumbKeys[s.SourceAppUserModelId ?? "unknown"] = thumbKey;
                    }
                    Emit(false);
                }
                catch (Exception ex) { Program.Log("media props: " + ex.Message); }
            });
        }

        internal static async Task<string> ReadImage(IRandomAccessStreamReference r)
        {
            try
            {
                using (var stream = await r.OpenReadAsync())
                {
                    if (stream.Size == 0 || stream.Size > 8 * 1024 * 1024) return null;
                    var bytes = new byte[stream.Size];
                    using (var reader = new DataReader(stream))
                    {
                        await reader.LoadAsync((uint)stream.Size);
                        reader.ReadBytes(bytes);
                    }
                    string type = string.IsNullOrEmpty(stream.ContentType) ? "image/png" : stream.ContentType;
                    return "data:" + type + ";base64," + Convert.ToBase64String(bytes);
                }
            }
            catch (Exception ex) { Program.Log("image: " + ex.Message); return null; }
        }

        public void Emit(bool force)
        {
            if (_mgr == null) return;
            var list = new List<object>();
            string current = null;
            try { var c = _mgr.GetCurrentSession(); if (c != null) current = c.SourceAppUserModelId; } catch { }
            var counts = new Dictionary<string, int>();
            foreach (var s in Sessions())
            {
                try
                {
                    var aumid = s.SourceAppUserModelId ?? "unknown";
                    int n; counts.TryGetValue(aumid, out n); counts[aumid] = n + 1;
                    var info = s.GetPlaybackInfo();
                    var tl = s.GetTimelineProperties();
                    var c = info.Controls;
                    var d = new Dictionary<string, object>
                    {
                        { "id", Id(s, n) },
                        { "app", aumid },
                        { "status", info.PlaybackStatus.ToString().ToLowerInvariant() },
                        { "position", (tl.Position - tl.StartTime).TotalSeconds },
                        { "duration", Math.Max(0, (tl.EndTime - tl.StartTime).TotalSeconds) },
                        { "updatedAt", Program.ToEpochMs(tl.LastUpdatedTime) },
                        { "rate", info.PlaybackRate.HasValue ? info.PlaybackRate.Value : 1.0 },
                        { "shuffle", info.IsShuffleActive.HasValue && info.IsShuffleActive.Value },
                        { "repeat", info.AutoRepeatMode.HasValue ? info.AutoRepeatMode.Value.ToString().ToLowerInvariant() : "none" },
                        { "canPlay", c.IsPlayEnabled },
                        { "canPause", c.IsPauseEnabled },
                        { "canNext", c.IsNextEnabled },
                        { "canPrev", c.IsPreviousEnabled },
                        { "canSeek", c.IsPlaybackPositionEnabled },
                        { "canShuffle", c.IsShuffleEnabled },
                        { "canRepeat", c.IsRepeatEnabled }
                    };
                    Dictionary<string, object> p;
                    lock (_lock) _props.TryGetValue(aumid, out p);
                    if (p != null) foreach (var kv in p) d[kv.Key] = kv.Value;
                    list.Add(d);
                }
                catch (Exception ex) { Program.Log("media session: " + ex.Message); }
            }
            var msg = new Dictionary<string, object> { { "type", "media" }, { "current", current }, { "sessions", list } };
            var ser = new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(msg);
            lock (_lock)
            {
                if (!force && ser == _last) return;
                _last = ser;
            }
            Program.Send(msg);
        }

        GlobalSystemMediaTransportControlsSession Find(string id)
        {
            var counts = new Dictionary<string, int>();
            GlobalSystemMediaTransportControlsSession first = null;
            foreach (var s in Sessions())
            {
                var aumid = s.SourceAppUserModelId ?? "unknown";
                int n; counts.TryGetValue(aumid, out n); counts[aumid] = n + 1;
                if (first == null) first = s;
                if (Id(s, n) == id) return s;
            }
            if (string.IsNullOrEmpty(id))
            {
                try { return _mgr.GetCurrentSession() ?? first; } catch { return first; }
            }
            return null;
        }

        public void Command(string id, string action, double position)
        {
            var s = Find(id);
            if (s == null) { Program.Log("media: no session " + id); return; }
            Task.Run(async () =>
            {
                try
                {
                    switch (action)
                    {
                        case "play": await s.TryPlayAsync(); break;
                        case "pause": await s.TryPauseAsync(); break;
                        case "toggle": await s.TryTogglePlayPauseAsync(); break;
                        case "next": await s.TrySkipNextAsync(); break;
                        case "prev": await s.TrySkipPreviousAsync(); break;
                        case "stop": await s.TryStopAsync(); break;
                        case "shuffle":
                            var sh = s.GetPlaybackInfo().IsShuffleActive;
                            await s.TryChangeShuffleActiveAsync(!(sh.HasValue && sh.Value)); break;
                        case "repeat":
                            var r = s.GetPlaybackInfo().AutoRepeatMode ?? Windows.Media.MediaPlaybackAutoRepeatMode.None;
                            var next = r == Windows.Media.MediaPlaybackAutoRepeatMode.None ? Windows.Media.MediaPlaybackAutoRepeatMode.List
                                     : r == Windows.Media.MediaPlaybackAutoRepeatMode.List ? Windows.Media.MediaPlaybackAutoRepeatMode.Track
                                     : Windows.Media.MediaPlaybackAutoRepeatMode.None;
                            await s.TryChangeAutoRepeatModeAsync(next); break;
                        case "seek":
                            var tl = s.GetTimelineProperties();
                            long ticks = tl.StartTime.Ticks + (long)(Math.Max(0, position) * TimeSpan.TicksPerSecond);
                            await s.TryChangePlaybackPositionAsync(ticks); break;
                        case "focus": Launcher.Focus(s.SourceAppUserModelId); break;
                    }
                }
                catch (Exception ex) { Program.Log("media " + action + ": " + ex.Message); }
                Thread.Sleep(150);
                Emit(false);
            });
        }

        public object Summary()
        {
            var list = new List<object>();
            foreach (var s in Sessions())
            {
                try
                {
                    Dictionary<string, object> p;
                    lock (_lock) _props.TryGetValue(s.SourceAppUserModelId ?? "unknown", out p);
                    list.Add(new Dictionary<string, object> {
                        { "app", s.SourceAppUserModelId },
                        { "status", s.GetPlaybackInfo().PlaybackStatus.ToString() },
                        { "title", p != null ? p["title"] : null }
                    });
                }
                catch { }
            }
            return list;
        }
    }
}
