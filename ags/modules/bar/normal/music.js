const { GLib } = imports.gi;
import Widget from 'resource:///com/github/Aylur/ags/widget.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';
import Mpris from 'resource:///com/github/Aylur/ags/service/mpris.js';
const { Box, Button, EventBox, Label, Overlay, Revealer, Scrollable } = Widget;
const { execAsync, exec } = Utils;
import { AnimatedCircProg } from "../../.commonwidgets/cairo_circularprogress.js";
import { MaterialIcon } from '../../.commonwidgets/materialicon.js';
import { showMusicControls } from '../../../variables.js';

const CUSTOM_MODULE_CONTENT_INTERVAL_FILE = `${GLib.get_user_cache_dir()}/ags/user/scripts/custom-module-interval.txt`;
const CUSTOM_MODULE_CONTENT_SCRIPT = `${GLib.get_user_cache_dir()}/ags/user/scripts/custom-module-poll.sh`;
const CUSTOM_MODULE_LEFTCLICK_SCRIPT = `${GLib.get_user_cache_dir()}/ags/user/scripts/custom-module-leftclick.sh`;
const CUSTOM_MODULE_RIGHTCLICK_SCRIPT = `${GLib.get_user_cache_dir()}/ags/user/scripts/custom-module-rightclick.sh`;
const CUSTOM_MODULE_MIDDLECLICK_SCRIPT = `${GLib.get_user_cache_dir()}/ags/user/scripts/custom-module-middleclick.sh`;
const CUSTOM_MODULE_SCROLLUP_SCRIPT = `${GLib.get_user_cache_dir()}/ags/user/scripts/custom-module-scrollup.sh`;
const CUSTOM_MODULE_SCROLLDOWN_SCRIPT = `${GLib.get_user_cache_dir()}/ags/user/scripts/custom-module-scrolldown.sh`;

function trimTrackTitle(title) {
    if (!title) return '';
    const cleanPatterns = [
        /【[^】]*】/,        // Touhou n weeb stuff
        " [FREE DOWNLOAD]", // F-777
    ];
    cleanPatterns.forEach((expr) => title = title.replace(expr, ''));
    return title;
}

const BarGroup = ({ child }) => Box({
    className: 'bar-group-margin bar-sides',
    children: [
        Box({
            className: 'bar-group bar-group-standalone bar-group-pad-system',
            children: [child],
        }),
    ]
});

const BarResource = (name, icon, command, circprogClassName = 'bar-batt-circprog', textClassName = 'txt-onSurfaceVariant', iconClassName = 'bar-batt') => {
    const resourceCircProg = AnimatedCircProg({
        className: `${circprogClassName}`,
        vpack: 'center',
        hpack: 'center',
    });
    const resourceProgress = Box({
        homogeneous: true,
        children: [Overlay({
            child: Box({
                vpack: 'center',
                className: `${iconClassName}`,
                homogeneous: true,
                children: [
                    MaterialIcon(icon, 'small'),
                ],
            }),
            overlays: [resourceCircProg]
        })]
    });
    const resourceLabel = Label({
        className: `txt-smallie ${textClassName}`,
    });
    const widget = Button({
        onClicked: () => Utils.execAsync(['bash', '-c', `${userOptions.apps.taskManager}`]).catch(print),
        child: Box({
            className: `spacing-h-4 ${textClassName}`,
            children: [
                resourceProgress,
                resourceLabel,
            ],
            setup: (self) => self.poll(5000, () => execAsync(['bash', '-c', command])
                .then((output) => {
                    resourceCircProg.css = `font-size: ${Number(output)}px;`;
                    resourceLabel.label = `${Math.round(Number(output))}%`;
                    widget.tooltipText = `${name}: ${Math.round(Number(output))}%`;
                }).catch(print))
            ,
        })
    });
    return widget;
}

let lyricsData = [];
let currentLyricIndex = 0;

const updateLyricsDisplay = (currentTime) => {
    if (!lyricsData.length) return;

    while (currentLyricIndex < lyricsData.length - 1 && currentTime >= lyricsData[currentLyricIndex + 1].time) {
        currentLyricIndex++;
    }

    return lyricsData[currentLyricIndex].text || "♪";
};

const getLyrics = async (trackTitle, trackArtist) => {
    try {
        const url = `http://10.132.99.22:28883/api/v1/lyrics/single?artist=${encodeURIComponent(trackArtist)}&title=${encodeURIComponent(trackTitle)}`
        const response = await execAsync(['curl', '-s', url]);
        const lyricsText = response.trim();

        if (lyricsText === "Lyrics not found.") {
            return [{ time: 0, text: "Lyrics not found." }];
        }

        // Parse the lyrics
        const lyrics = lyricsText.split('\n').map(line => {
            const match = line.match(/\[(\d{2}):(\d{2}\.\d{3})\](.*)/);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseFloat(match[2]);
                const time = minutes * 60 + seconds;
                return { time, text: match[3].trim() };
            }
            return null;
        }).filter(line => line !== null);  // Filter out null entries for non-matching lines

        return lyrics;
    } catch (error) {
        print(error);
        return [{ time: 0, text: 'Error fetching lyrics' }];
    }
};

const TrackProgress = () => {
    const _updateProgress = (circprog) => {
        const mpris = Mpris.getPlayer('');
        if (!mpris) return;
        // Set circular progress value
        circprog.css = `font-size: ${Math.max(mpris.position / mpris.length * 100, 0)}px;`
    }
    return AnimatedCircProg({
        className: 'bar-music-circprog',
        vpack: 'center', hpack: 'center',
        extraSetup: (self) => self
            .hook(Mpris, _updateProgress)
            .poll(3000, _updateProgress)
        ,
    })
}

const switchToRelativeWorkspace = async (self, num) => {
    try {
        const Hyprland = (await import('resource:///com/github/Aylur/ags/service/hyprland.js')).default;
        Hyprland.messageAsync(`dispatch workspace ${num > 0 ? '+' : ''}${num}`).catch(print);
    } catch {
        execAsync([`${App.configDir}/scripts/sway/swayToRelativeWs.sh`, `${num}`]).catch(print);
    }
}

export default () => {
    // TODO: use cairo to make button bounce smaller on click, if that's possible
    const playingState = Box({ // Wrap a box cuz overlay can't have margins itself
        homogeneous: true,
        children: [Overlay({
            child: Box({
                vpack: 'center',
                className: 'bar-music-playstate',
                homogeneous: true,
                children: [Label({
                    vpack: 'center',
                    className: 'bar-music-playstate-txt',
                    justification: 'center',
                    setup: (self) => self.hook(Mpris, label => {
                        const mpris = Mpris.getPlayer('');
                        label.label = `${mpris !== null && mpris.playBackStatus == 'Playing' ? 'pause' : 'play_arrow'}`;
                    }),
                })],
                setup: (self) => self.hook(Mpris, label => {
                    const mpris = Mpris.getPlayer('');
                    if (!mpris) return;
                    label.toggleClassName('bar-music-playstate-playing', mpris !== null && mpris.playBackStatus == 'Playing');
                    label.toggleClassName('bar-music-playstate', mpris !== null || mpris.playBackStatus == 'Paused');
                }),
            }),
            overlays: [
                TrackProgress(),
            ]
        })]
    });
    const trackTitle = Label({
        hexpand: true,
        className: 'txt-smallie bar-music-txt',
        truncate: 'end',
        maxWidthChars: 1, // Doesn't matter, just needs to be non negative
        setup: (self) => self.hook(Mpris, async (label) => {
            const mpris = Mpris.getPlayer('');
            if (mpris) {
                const title = trimTrackTitle(mpris.trackTitle);
                const artist = mpris.trackArtists.join(', ');
                label.label = `${title} • ${artist}`;
                // 获取并解析歌词
                const fetchedLyrics = await getLyrics(title, artist);

                // 如果歌词找到，则显示歌词，否则显示标题
                if (fetchedLyrics.length > 1 && fetchedLyrics[0].text !== "Lyrics not found.") {
                    lyricsData = fetchedLyrics; // 更新歌词数据
                    currentLyricIndex = 0; // 重置歌词索引
                    label.label = updateLyricsDisplay(0);
                } else {
                    label.label = `${title} • ${artist}`; // 未找到歌词，显示标题
                }
            } else {
                label.label = 'No media';
            }
            self.poll(200, () => {
                const mpris = Mpris.getPlayer('');
                if (mpris && lyricsData.length > 1 && lyricsData[0].text !== "Lyrics not found." && lyricsData[currentLyricIndex].text !== "纯音乐，请欣赏") {
                    const currentTime = mpris.position;
                    label.label = `${updateLyricsDisplay(currentTime)}`;
                } else {
                    const title = trimTrackTitle(mpris.trackTitle);
                    const artist = mpris.trackArtists.join(', ');
                    label.label = `${title} • ${artist}`;
                }
            });
        }),
    })
    const musicStuff = Box({
        className: 'spacing-h-10',
        hexpand: true,
        children: [
            playingState,
            trackTitle,
        ]
    })
    const SystemResourcesOrCustomModule = () => {
        // Check if $XDG_CACHE_HOME/ags/user/scripts/custom-module-poll.sh exists
        if (GLib.file_test(CUSTOM_MODULE_CONTENT_SCRIPT, GLib.FileTest.EXISTS)) {
            const interval = Number(Utils.readFile(CUSTOM_MODULE_CONTENT_INTERVAL_FILE)) || 5000;
            return BarGroup({
                child: Button({
                    child: Label({
                        className: 'txt-smallie txt-onSurfaceVariant',
                        useMarkup: true,
                        setup: (self) => Utils.timeout(1, () => {
                            self.label = exec(CUSTOM_MODULE_CONTENT_SCRIPT);
                            self.poll(interval, (self) => {
                                const content = exec(CUSTOM_MODULE_CONTENT_SCRIPT);
                                self.label = content;
                            })
                        })
                    }),
                    onPrimaryClickRelease: () => execAsync(CUSTOM_MODULE_LEFTCLICK_SCRIPT).catch(print),
                    onSecondaryClickRelease: () => execAsync(CUSTOM_MODULE_RIGHTCLICK_SCRIPT).catch(print),
                    onMiddleClickRelease: () => execAsync(CUSTOM_MODULE_MIDDLECLICK_SCRIPT).catch(print),
                    onScrollUp: () => execAsync(CUSTOM_MODULE_SCROLLUP_SCRIPT).catch(print),
                    onScrollDown: () => execAsync(CUSTOM_MODULE_SCROLLDOWN_SCRIPT).catch(print),
                })
            });
        } else return BarGroup({
            child: Box({
                children: [
                    BarResource('RAM Usage', 'memory', `LANG=C free | awk '/^Mem/ {printf("%.2f\\n", ($3/$2) * 100)}'`,
                        'bar-ram-circprog', 'bar-ram-txt', 'bar-ram-icon'),
                    Revealer({
                        revealChild: true,
                        transition: 'slide_left',
                        transitionDuration: userOptions.animations.durationLarge,
                        child: Box({
                            className: 'spacing-h-10 margin-left-10',
                            children: [
                                BarResource('Swap Usage', 'swap_horiz', `LANG=C free | awk '/^Swap/ {if ($2 > 0) printf("%.2f\\n", ($3/$2) * 100); else print "0";}'`,
                                    'bar-swap-circprog', 'bar-swap-txt', 'bar-swap-icon'),
                                BarResource('CPU Usage', 'settings_motion_mode', `LANG=C top -bn1 | grep Cpu | sed 's/\\,/\\./g' | awk '{print $2}'`,
                                    'bar-cpu-circprog', 'bar-cpu-txt', 'bar-cpu-icon'),
                            ]
                        }),
                        setup: (self) => self.hook(Mpris, label => {
                            const mpris = Mpris.getPlayer('');
                            self.revealChild = (!mpris);
                        }),
                    })
                ],
            })
        });
    }
    return EventBox({
        onScrollUp: (self) => switchToRelativeWorkspace(self, -1),
        onScrollDown: (self) => switchToRelativeWorkspace(self, +1),
        child: Box({
            className: 'spacing-h-4',
            children: [
                SystemResourcesOrCustomModule(),
                EventBox({
                    child: BarGroup({ child: musicStuff }),
                    onPrimaryClick: () => showMusicControls.setValue(!showMusicControls.value),
                    onSecondaryClick: () => execAsync(['bash', '-c', 'playerctl next || playerctl position `bc <<< "100 * $(playerctl metadata mpris:length) / 1000000 / 100"` &']).catch(print),
                    onMiddleClick: () => execAsync('playerctl play-pause').catch(print),
                    setup: (self) => self.on('button-press-event', (self, event) => {
                        if (event.get_button()[1] === 8) // Side button
                            execAsync('playerctl previous').catch(print)
                    }),
                })
            ]
        })
    });
}
