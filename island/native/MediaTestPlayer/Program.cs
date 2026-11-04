// Fake player: owns a SystemMediaTransportControls session ("WinIsland CI Song"), reacts to
// play / pause / seek requests from other apps and keeps its timeline up to date.
using System;
using System.Threading;
using Windows.Media;
using Windows.Media.Playback;

static class Program
{
    static readonly object Lock = new object();
    static bool _playing = true;
    static double _pos;                 // seconds at _at
    static DateTime _at = DateTime.UtcNow;
    const double Duration = 180;

    static double Now() { lock (Lock) return Math.Min(Duration, _pos + (_playing ? (DateTime.UtcNow - _at).TotalSeconds : 0)); }

    static void Main(string[] args)
    {
        int seconds = args.Length > 0 ? int.Parse(args[0]) : 100;
        var player = new MediaPlayer();
        player.CommandManager.IsEnabled = false; // we drive the controls ourselves
        var smtc = player.SystemMediaTransportControls;
        smtc.IsEnabled = true;
        smtc.IsPlayEnabled = true;
        smtc.IsPauseEnabled = true;
        smtc.IsNextEnabled = true;
        smtc.IsPreviousEnabled = true;
        var du = smtc.DisplayUpdater;
        du.Type = MediaPlaybackType.Music;
        du.MusicProperties.Title = "WinIsland CI Song";
        du.MusicProperties.Artist = "GitHub Actions";
        du.MusicProperties.AlbumTitle = "Test Album";
        du.Update();

        smtc.ButtonPressed += (s, e) =>
        {
            lock (Lock)
            {
                double p = Math.Min(Duration, _pos + (_playing ? (DateTime.UtcNow - _at).TotalSeconds : 0));
                _pos = p; _at = DateTime.UtcNow;
                if (e.Button == SystemMediaTransportControlsButton.Play) _playing = true;
                else if (e.Button == SystemMediaTransportControlsButton.Pause) _playing = false;
                else if (e.Button == SystemMediaTransportControlsButton.Next || e.Button == SystemMediaTransportControlsButton.Previous) _pos = 0;
            }
            Console.WriteLine("button " + e.Button);
            Publish(smtc);
        };
        smtc.PlaybackPositionChangeRequested += (s, e) =>
        {
            lock (Lock) { _pos = e.RequestedPlaybackPosition.TotalSeconds; _at = DateTime.UtcNow; }
            Console.WriteLine("seek " + e.RequestedPlaybackPosition.TotalSeconds);
            Publish(smtc);
        };

        Publish(smtc);
        Console.WriteLine("playing");
        for (int i = 0; i < seconds; i++) { Thread.Sleep(1000); Publish(smtc); }
    }

    static void Publish(SystemMediaTransportControls smtc)
    {
        bool playing; lock (Lock) playing = _playing;
        smtc.PlaybackStatus = playing ? MediaPlaybackStatus.Playing : MediaPlaybackStatus.Paused;
        smtc.UpdateTimelineProperties(new SystemMediaTransportControlsTimelineProperties
        {
            StartTime = TimeSpan.Zero,
            EndTime = TimeSpan.FromSeconds(Duration),
            MinSeekTime = TimeSpan.Zero,
            MaxSeekTime = TimeSpan.FromSeconds(Duration),
            Position = TimeSpan.FromSeconds(Now())
        });
    }
}
