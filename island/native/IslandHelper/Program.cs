// WinIsland helper: a small background process that the WinIsland UI starts.
// It talks to Windows APIs that Electron cannot reach (media sessions, notifications,
// audio endpoint, privacy indicators, fullscreen detection) and exchanges
// one JSON object per line over stdin/stdout.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace IslandHelper
{
    internal static class Program
    {
        static readonly object OutLock = new object();
        static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        static TextWriter _out;
        static readonly ManualResetEvent Exit = new ManualResetEvent(false);

        internal static MediaMonitor Media;
        internal static NotificationMonitor Notifications;
        internal static AudioMonitor Audio;
        internal static PrivacyMonitor Privacy;
        internal static SystemMonitor Sys;

        [STAThread]
        static int Main(string[] args)
        {
            var stdout = Console.OpenStandardOutput();
            _out = new StreamWriter(stdout, new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };

            bool selfTest = Array.IndexOf(args, "--selftest") >= 0;
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Log("unhandled: " + e.ExceptionObject);
            TaskScheduler.UnobservedTaskException += (s, e) => { Log("unobserved: " + e.Exception.GetBaseException().Message); e.SetObserved(); };

            Send(new Dictionary<string, object> { { "type", "hello" }, { "version", "1.0.0" }, { "pid", System.Diagnostics.Process.GetCurrentProcess().Id } });

            Media = new MediaMonitor();
            Notifications = new NotificationMonitor();
            Audio = new AudioMonitor();
            Privacy = new PrivacyMonitor();
            Sys = new SystemMonitor();

            // Each monitor starts on its own thread so a slow or blocked Windows API
            // (e.g. a permission prompt) never holds up the others.
            Background("media", () => Media.Start(), ApartmentState.MTA);
            Background("notifications", () => Notifications.Start(), ApartmentState.STA);
            Safe("audio", () => Audio.Start());
            Safe("privacy", () => Privacy.Start());
            Safe("system", () => Sys.Start());

            if (selfTest)
            {
                // Used by CI: run every monitor for a few seconds, print a summary and exit.
                Thread.Sleep(6000);
                Send(new Dictionary<string, object> {
                    { "type", "selftest" },
                    { "media", Media.Summary() },
                    { "notifications", Notifications.Mode },
                    { "notificationsDetail", Notifications.Detail },
                    { "audio", Audio.Summary() },
                    { "fullscreen", Sys.Fullscreen }
                });
                return 0;
            }

            var reader = new Thread(ReadCommands) { IsBackground = true, Name = "stdin" };
            reader.Start();
            Exit.WaitOne();
            return 0;
        }

        static void Background(string name, Action a, ApartmentState apartment)
        {
            var t = new Thread(() => Safe(name, a)) { IsBackground = true, Name = name };
            t.SetApartmentState(apartment);
            t.Start();
        }

        static void Safe(string name, Action a)
        {
            try { a(); }
            catch (Exception ex) { Log(name + " failed to start: " + ex.Message); }
        }

        static void ReadCommands()
        {
            var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
            string line;
            while ((line = stdin.ReadLine()) != null)
            {
                line = line.Trim();
                if (line.Length == 0) continue;
                try
                {
                    var cmd = Json.Deserialize<Dictionary<string, object>>(line);
                    Handle(cmd);
                }
                catch (Exception ex) { Log("bad command: " + ex.Message); }
            }
            // Parent closed our stdin: it exited, so we exit too.
            Exit.Set();
        }

        static void Handle(Dictionary<string, object> c)
        {
            string cmd = Str(c, "cmd");
            switch (cmd)
            {
                case "ping": Send(new Dictionary<string, object> { { "type", "pong" } }); break;
                case "media": Media.Command(Str(c, "id"), Str(c, "action"), Num(c, "position")); break;
                case "media-refresh": Media.Emit(true); break;
                case "notif-dismiss": Notifications.Dismiss(Str(c, "id")); break;
                case "notif-clear": Notifications.ClearAll(); break;
                case "notif-request-access": Notifications.RequestAccess(); break;
                case "open-app": Launcher.Open(Str(c, "appId")); break;
                case "volume-set": Audio.SetVolume((float)Num(c, "level")); break;
                case "volume-mute": Audio.ToggleMute(); break;
                case "quit": Exit.Set(); break;
                default: Log("unknown command " + cmd); break;
            }
        }

        internal static string Str(Dictionary<string, object> d, string k)
        {
            object v; return d != null && d.TryGetValue(k, out v) && v != null ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture) : null;
        }

        internal static double Num(Dictionary<string, object> d, string k)
        {
            object v;
            if (d == null || !d.TryGetValue(k, out v) || v == null) return 0;
            try { return Convert.ToDouble(v, System.Globalization.CultureInfo.InvariantCulture); } catch { return 0; }
        }

        internal static void Send(object msg)
        {
            string s;
            try { s = Json.Serialize(msg); }
            catch (Exception ex) { Log("serialize: " + ex.Message); return; }
            lock (OutLock)
            {
                try { _out.WriteLine(s); } catch { Exit.Set(); }
            }
        }

        internal static void Log(string s)
        {
            try { Console.Error.WriteLine("[helper] " + s); } catch { }
        }

        internal static long ToEpochMs(DateTimeOffset d)
        {
            if (d.Year < 1971) return 0;
            return d.ToUnixTimeMilliseconds();
        }
    }
}
