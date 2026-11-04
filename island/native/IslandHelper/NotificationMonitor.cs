// Notifications: mirrors every toast Windows shows. First it tries the official
// UserNotificationListener (needs "Notification access" in Privacy settings). If that
// API is not available to the app, it reads the Windows notification database
// (%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db) read-only instead,
// through the winsqlite3.dll that ships with Windows.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

namespace IslandHelper
{
    internal sealed class NotificationMonitor
    {
        public string Mode = "starting";
        public string Detail = "";
        UserNotificationListener _listener;
        readonly HashSet<string> _known = new HashSet<string>();
        readonly Dictionary<string, string> _icons = new Dictionary<string, string>();
        Timer _timer;
        long _lastDbId = -1;
        bool _busy;

        public void Start()
        {
            if (Environment.GetEnvironmentVariable("WINISLAND_NOTIF_MODE") == "database") { StartDatabase("forced"); return; }
            try
            {
                _listener = UserNotificationListener.Current;
                var status = _listener.GetAccessStatus();
                if (status == UserNotificationListenerAccessStatus.Unspecified)
                {
                    // Windows may show a consent prompt; don't wait on it forever.
                    var ask = _listener.RequestAccessAsync().AsTask();
                    status = ask.Wait(20000) ? ask.Result : UserNotificationListenerAccessStatus.Unspecified;
                }
                if (status == UserNotificationListenerAccessStatus.Allowed)
                {
                    // Prime: everything already in the notification centre is history, not new.
                    var existing = _listener.GetNotificationsAsync(NotificationKinds.Toast).AsTask().GetAwaiter().GetResult();
                    var history = new List<object>();
                    foreach (var n in existing.OrderBy(x => x.CreationTime))
                    {
                        _known.Add(n.Id.ToString());
                        var m = FromListener(n);
                        if (m != null) history.Add(m);
                    }
                    SetMode("listener", "");
                    Program.Send(new Dictionary<string, object> { { "type", "notification-history" }, { "items", history.Skip(Math.Max(0, history.Count - 30)).ToList() } });
                    _timer = new Timer(_ => PollListener(), null, 800, 800);
                    return;
                }
                Detail = "Notification access is " + status;
                Program.Log("listener status " + status + ", falling back to database");
            }
            catch (Exception ex)
            {
                Detail = ex.Message;
                Program.Log("listener unavailable (" + ex.Message + "), falling back to database");
                _listener = null;
            }
            StartDatabase(Detail);
        }

        void SetMode(string mode, string detail)
        {
            Mode = mode; Detail = detail ?? "";
            Program.Send(new Dictionary<string, object> { { "type", "notif-status" }, { "mode", mode }, { "detail", Detail } });
        }

        public void RequestAccess()
        {
            Task.Run(() =>
            {
                try
                {
                    var l = UserNotificationListener.Current;
                    var st = l.RequestAccessAsync().AsTask().GetAwaiter().GetResult();
                    Program.Send(new Dictionary<string, object> { { "type", "notif-access" }, { "status", st.ToString() } });
                    if (st == UserNotificationListenerAccessStatus.Allowed && Mode != "listener")
                    {
                        _timer?.Dispose(); _timer = null; _listener = null; Start();
                    }
                }
                catch (Exception ex) { Program.Send(new Dictionary<string, object> { { "type", "notif-access" }, { "status", "Unavailable" }, { "detail", ex.Message } }); }
            });
        }

        // ---------- Official listener ----------
        void PollListener()
        {
            if (_busy || _listener == null) return;
            _busy = true;
            try
            {
                var list = _listener.GetNotificationsAsync(NotificationKinds.Toast).AsTask().GetAwaiter().GetResult();
                var ids = new HashSet<string>();
                foreach (var n in list.OrderBy(x => x.CreationTime))
                {
                    var id = n.Id.ToString();
                    ids.Add(id);
                    if (_known.Add(id))
                    {
                        var m = FromListener(n);
                        if (m != null) { m["type"] = "notification"; Program.Send(m); }
                    }
                }
                foreach (var gone in _known.Where(k => !ids.Contains(k)).ToList())
                {
                    _known.Remove(gone);
                    Program.Send(new Dictionary<string, object> { { "type", "notification-removed" }, { "id", gone } });
                }
            }
            catch (Exception ex) { Program.Log("listener poll: " + ex.Message); }
            finally { _busy = false; }
        }

        Dictionary<string, object> FromListener(UserNotification n)
        {
            try
            {
                string appName = "", appId = "";
                try { appName = n.AppInfo.DisplayInfo.DisplayName; appId = n.AppInfo.AppUserModelId; } catch { }
                var binding = n.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
                var texts = binding != null ? binding.GetTextElements().Select(t => t.Text).Where(t => !string.IsNullOrWhiteSpace(t)).ToList() : new List<string>();
                if (string.IsNullOrEmpty(appName)) appName = AppNames.Get(appId);
                return new Dictionary<string, object>
                {
                    { "id", n.Id.ToString() },
                    { "appId", appId },
                    { "app", appName },
                    { "title", texts.Count > 0 ? texts[0] : "" },
                    { "body", string.Join("\n", texts.Skip(1)) },
                    { "time", Program.ToEpochMs(n.CreationTime) },
                    { "icon", Icon(appId, n) },
                    { "source", "listener" }
                };
            }
            catch (Exception ex) { Program.Log("notif read: " + ex.Message); return null; }
        }

        string Icon(string appId, UserNotification n)
        {
            if (string.IsNullOrEmpty(appId)) return null;
            lock (_icons) { string c; if (_icons.TryGetValue(appId, out c)) return c; }
            string data = null;
            try
            {
                var logo = n.AppInfo.DisplayInfo.GetLogo(new Windows.Foundation.Size(64, 64));
                data = MediaMonitor.ReadImage(logo).GetAwaiter().GetResult();
            }
            catch { }
            lock (_icons) _icons[appId] = data;
            return data;
        }

        public void Dismiss(string id)
        {
            uint u;
            if (_listener != null && uint.TryParse(id, out u))
            {
                try { _listener.RemoveNotification(u); } catch (Exception ex) { Program.Log("dismiss: " + ex.Message); }
            }
        }

        public void ClearAll()
        {
            if (_listener != null) { try { _listener.ClearNotifications(); } catch (Exception ex) { Program.Log("clear: " + ex.Message); } }
        }

        // ---------- Database fallback ----------
        static string DbPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Windows\Notifications\wpndatabase.db");

        void StartDatabase(string why)
        {
            if (!File.Exists(DbPath)) { SetMode("unavailable", "Notification database not found. " + why); return; }
            try
            {
                var rows = QueryDb(-1, 30);
                var history = new List<object>();
                foreach (var r in rows) { var m = FromDbRow(r); if (m != null) history.Add(m); if (r.Id > _lastDbId) _lastDbId = r.Id; }
                if (_lastDbId < 0) _lastDbId = 0;
                SetMode("database", why);
                Program.Send(new Dictionary<string, object> { { "type", "notification-history" }, { "items", history } });
                _timer = new Timer(_ => PollDb(), null, 1000, 1000);
            }
            catch (Exception ex) { SetMode("unavailable", "Could not read notifications: " + ex.Message); }
        }

        void PollDb()
        {
            if (_busy) return;
            _busy = true;
            try
            {
                foreach (var r in QueryDb(_lastDbId, 20))
                {
                    if (r.Id > _lastDbId) _lastDbId = r.Id;
                    var m = FromDbRow(r);
                    if (m != null) { m["type"] = "notification"; Program.Send(m); }
                }
            }
            catch (Exception ex) { Program.Log("db poll: " + ex.Message); }
            finally { _busy = false; }
        }

        internal sealed class Row { public long Id; public long Arrival; public string Payload; public string AppId; }

        static List<Row> QueryDb(long afterId, int limit)
        {
            var list = new List<Row>();
            string sql = afterId < 0
                ? "SELECT n.Id, n.ArrivalTime, n.Payload, h.PrimaryId FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId WHERE n.Type = 'toast' ORDER BY n.Id DESC LIMIT " + limit
                : "SELECT n.Id, n.ArrivalTime, n.Payload, h.PrimaryId FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId WHERE n.Type = 'toast' AND n.Id > " + afterId + " ORDER BY n.Id ASC LIMIT " + limit;
            using (var db = new Sqlite(DbPath))
            using (var st = db.Prepare(sql))
            {
                while (st.Step())
                    list.Add(new Row { Id = st.Int64(0), Arrival = st.Int64(1), Payload = st.Text(2), AppId = st.Text(3) });
            }
            if (afterId < 0) list.Reverse();
            return list;
        }

        Dictionary<string, object> FromDbRow(Row r)
        {
            var parsed = ToastXml.Parse(r.Payload);
            if (parsed == null) return null;
            long time = 0;
            try { time = Program.ToEpochMs(DateTimeOffset.FromFileTime(r.Arrival)); } catch { }
            return new Dictionary<string, object>
            {
                { "id", "db" + r.Id },
                { "appId", r.AppId },
                { "app", AppNames.Get(r.AppId) },
                { "title", parsed.Item1 },
                { "body", parsed.Item2 },
                { "time", time },
                { "icon", parsed.Item3 },
                { "source", "database" }
            };
        }
    }

    internal static class ToastXml
    {
        // Returns (title, body, iconDataUri) from a toast XML payload.
        public static Tuple<string, string, string> Parse(string xml)
        {
            if (string.IsNullOrWhiteSpace(xml)) return null;
            try
            {
                var doc = new XmlDocument { XmlResolver = null };
                doc.LoadXml(xml);
                var binding = doc.SelectSingleNode("//binding[@template='ToastGeneric']") ?? doc.SelectSingleNode("//binding");
                if (binding == null) return null;
                var texts = new List<string>();
                foreach (XmlNode t in binding.SelectNodes(".//text"))
                {
                    var hint = t.Attributes?["placement"]?.Value;
                    if (hint == "attribution") continue;
                    var s = (t.InnerText ?? "").Trim();
                    if (s.Length > 0) texts.Add(s);
                }
                if (texts.Count == 0) return null;
                string icon = null;
                var img = binding.SelectSingleNode(".//image[@placement='appLogoOverride']") as XmlElement;
                if (img != null) icon = ImageFromSrc(img.GetAttribute("src"));
                return Tuple.Create(texts[0], string.Join("\n", texts.Skip(1)), icon);
            }
            catch { return null; }
        }

        static string ImageFromSrc(string src)
        {
            try
            {
                if (string.IsNullOrEmpty(src)) return null;
                string path = null;
                if (src.StartsWith("file:///", StringComparison.OrdinalIgnoreCase)) path = Uri.UnescapeDataString(src.Substring(8)).Replace('/', '\\');
                else if (src.Length > 2 && src[1] == ':') path = src;
                if (path != null && File.Exists(path) && new FileInfo(path).Length < 2 * 1024 * 1024)
                {
                    var ext = Path.GetExtension(path).ToLowerInvariant();
                    var type = ext == ".jpg" || ext == ".jpeg" ? "image/jpeg" : ext == ".gif" ? "image/gif" : ext == ".ico" ? "image/x-icon" : "image/png";
                    return "data:" + type + ";base64," + Convert.ToBase64String(File.ReadAllBytes(path));
                }
                if (src.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return src;
            }
            catch { }
            return null;
        }
    }

    // Minimal read-only access to SQLite through the copy that ships with Windows.
    internal sealed class Sqlite : IDisposable
    {
        const string Dll = "winsqlite3.dll";
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] static extern int sqlite3_open_v2(byte[] filename, out IntPtr db, int flags, IntPtr vfs);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] static extern int sqlite3_close_v2(IntPtr db);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] static extern int sqlite3_busy_timeout(IntPtr db, int ms);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int nByte, out IntPtr stmt, IntPtr tail);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] internal static extern int sqlite3_step(IntPtr stmt);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] internal static extern int sqlite3_finalize(IntPtr stmt);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] internal static extern long sqlite3_column_int64(IntPtr stmt, int col);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] internal static extern IntPtr sqlite3_column_blob(IntPtr stmt, int col);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] internal static extern int sqlite3_column_bytes(IntPtr stmt, int col);
        [DllImport(Dll, CallingConvention = CallingConvention.StdCall)] static extern IntPtr sqlite3_errmsg(IntPtr db);

        IntPtr _db;
        public Sqlite(string path)
        {
            // SQLITE_OPEN_READONLY: we never write to the Windows database.
            int rc = sqlite3_open_v2(Utf8(path), out _db, 0x01, IntPtr.Zero);
            if (rc != 0) { var m = Err(); Dispose(); throw new IOException("sqlite open " + rc + " " + m); }
            sqlite3_busy_timeout(_db, 2000);
        }

        static byte[] Utf8(string s) { var b = Encoding.UTF8.GetBytes(s); Array.Resize(ref b, b.Length + 1); return b; }
        string Err() { try { return Marshal.PtrToStringAnsi(sqlite3_errmsg(_db)); } catch { return ""; } }

        public Statement Prepare(string sql)
        {
            IntPtr st;
            int rc = sqlite3_prepare_v2(_db, Utf8(sql), -1, out st, IntPtr.Zero);
            if (rc != 0) throw new IOException("sqlite prepare " + rc + " " + Err());
            return new Statement(st);
        }

        public void Dispose() { if (_db != IntPtr.Zero) { sqlite3_close_v2(_db); _db = IntPtr.Zero; } }

        internal sealed class Statement : IDisposable
        {
            IntPtr _st;
            public Statement(IntPtr st) { _st = st; }
            public bool Step()
            {
                int rc = sqlite3_step(_st);
                if (rc == 100) return true;   // SQLITE_ROW
                if (rc == 101) return false;  // SQLITE_DONE
                throw new IOException("sqlite step " + rc);
            }
            public long Int64(int c) => sqlite3_column_int64(_st, c);
            public string Text(int c)
            {
                var p = sqlite3_column_blob(_st, c);
                int n = sqlite3_column_bytes(_st, c);
                if (p == IntPtr.Zero || n <= 0) return "";
                var b = new byte[n];
                Marshal.Copy(p, b, 0, n);
                // Payloads are UTF-8 XML; strip a BOM or trailing NULs if present.
                var s = Encoding.UTF8.GetString(b).TrimEnd('\0');
                if (s.Length > 0 && s[0] == '﻿') s = s.Substring(1);
                return s;
            }
            public void Dispose() { if (_st != IntPtr.Zero) { sqlite3_finalize(_st); _st = IntPtr.Zero; } }
        }
    }
}
