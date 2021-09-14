// Based on https://github.com/mheine/gnome-shell-spotify-label/blob/master/prefs.js

"use strict";

const Lang = imports.lang;

const { Gio, Gtk, GObject, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { Utf8ArrayToStr, execCommunicate } = Me.imports.utils;

const Config = imports.misc.config;
const [major] = Config.PACKAGE_VERSION.split(".");
const shellVersion = Number.parseInt(major);

const positions = ["left", "center", "right"];

const mouseActionNamesMap = {
    none: "None",
    toggle_play: "Toggle play/pause",
    play: "Play",
    pause: "Pause",
    next: "Next",
    previous: "Previous",
    toggle_loop: "Cycle loop options",
    toggle_shuffle: "Toggle shuffle",
    toggle_menu: "Open sources menu",
    toggle_info: "Open track information menu",
    raise: "Raise player",
    quit: "Quit player",
};
let mouseActionNameIds = Object.keys(mouseActionNamesMap);

const presetSepChars = [
    "|...|",
    "[...]",
    "(...)",
    "{...}",
    "/...\\",
    "\\.../",
    ":...:",
    "-...-",
    "_..._",
    "=...=",
    "•...•",
    "█...█",
];

const elements = {
    icon: "Player icon",
    title: "Track title",
    controls: "Control icons",
    menu: "Sources menu",
};
const elementIds = Object.keys(elements);

const trackLabelOpts = {
    track: "Track",
    artist: "Artist",
    url: "URL",
    name: "Player name",
    status: "Playback status",
    file: "Filename",
    none: "None",
};
const trackLabelOptKeys = Object.keys(trackLabelOpts);

const mouseActionLabels = [
    "Left click",
    "Right click",
    "Middle click",
    "Left double click",
    "Right double click",
    "Scroll up",
    "Scroll down",
    "Hover <i><span size='smaller'>(unstable)</span></i>",
];

let settings,
    builder,
    MediaControlsBuilderScope,
    widgetPreset,
    widgetCustom,
    widgetCacheSize,
    widgetElementOrder,
    elementOrderWidgets,
    trackLabelStart,
    trackLabelSep,
    trackLabelEnd,
    widgetBacklistBox;

let elementOrder, trackLabelLock;

// Create a builder scope of the version id 40 or greater
if (shellVersion >= 40) {
    MediaControlsBuilderScope = GObject.registerClass(
        { Implements: [Gtk.BuilderScope] },
        class MediaControlsBuilderScope extends GObject.Object {
            vfunc_create_closure(builder, handlerName, flags, connectObject) {
                if (typeof signalHandler[handlerName] !== "undefined") {
                    return signalHandler[handlerName].bind(connectObject || this);
                }
            }
        }
    );
}

const signalHandler = {
    // Disable the opposite inputs from the selected and apply changes
    on_seperator_character_group_changed: (widget) => {
        let label = widget.get_label();
        let active = widget.get_active();
        if (label === "Preset" && active) {
            widgetCustom.set_sensitive(false);
            widgetPreset.set_sensitive(true);
            signalHandler.on_seperator_preset_changed(widgetPreset);
        } else if (label === "Custom" && active) {
            widgetPreset.set_sensitive(false);
            widgetCustom.set_sensitive(true);
            signalHandler.on_seperator_custom_changed(widgetCustom);
        }
    },
    on_seperator_preset_changed: (widget) => {
        if (builder.get_object("preset-radio-btn").get_active()) {
            let presetValue = presetSepChars[widget.get_active()];
            settings.set_strv("seperator-chars", [
                presetValue.charAt(0),
                presetValue.charAt(presetValue.length - 1),
            ]);
        }
    },
    on_seperator_custom_changed: (widget) => {
        if (builder.get_object("custom-radio-btn").get_active()) {
            let customValues = widget.get_text().split("...");
            if (customValues[0] && customValues[1]) {
                settings.set_strv("seperator-chars", [customValues[0], customValues[1]]);
            }
        }
    },

    // on_mouse_actions_left_changed: (widget) => {
    //     let currentMouseActions = settings.get_strv("mouse-actions");
    //     currentMouseActions[0] = mouseActionNameIds[widget.get_active()];
    //     settings.set_strv("mouse-actions", currentMouseActions);
    // },
    // on_mouse_actions_right_changed: (widget) => {
    //     let currentMouseActions = settings.get_strv("mouse-actions");
    //     currentMouseActions[1] = mouseActionNameIds[widget.get_active()];
    //     settings.set_strv("mouse-actions", currentMouseActions);
    // },
    on_extension_position_changed: (widget) => {
        settings.set_string("extension-position", positions[widget.get_active()]);
    },

    on_clear_cache_clicked: () => {
        let dir = GLib.get_user_config_dir() + "/media-controls";
        try {
            (async () => {
                builder.get_object("clear-cache-spinner").start();
                await execCommunicate(["rm", "-r", dir]);
                widgetCacheSize.set_text(await getCacheSize());
                builder.get_object("clear-cache-spinner").stop();
            })();
        } catch (error) {
            widgetCacheSize.set_text("Failed to clear cache");
        }
    },
    on_track_label_changed: () => {
        let currentTrackLabel = settings.get_strv("track-label");
        let trackLabelArray = [
            trackLabelOptKeys[trackLabelStart.get_active()] || currentTrackLabel[0],
            trackLabelSep.get_text() ?? currentTrackLabel[1],
            trackLabelOptKeys[trackLabelEnd.get_active()] || currentTrackLabel[2],
        ];

        settings.set_strv("track-label", trackLabelArray);
    },

    on_backlist_entry_changed: (entry) => {
        let currentBacklistApps = settings.get_strv("backlist-apps");
        currentBacklistApps.push(entry.get_text());
        addToBacklistListBox(entry.get_text());
        settings.set_strv("backlist-apps", currentBacklistApps);
        entry.set_text("");
    },
};

const bindSettings = () => {
    settings.bind(
        "max-widget-width",
        builder.get_object("max-widget-width"),
        "value",
        Gio.SettingsBindFlags.DEFAULT
    );
    // settings.bind("update-delay", builder.get_object("update-delay"), "value", Gio.SettingsBindFlags.DEFAULT);
    settings.bind("show-text", builder.get_object("show-text"), "active", Gio.SettingsBindFlags.DEFAULT);
    settings.bind(
        "show-player-icon",
        builder.get_object("show-player-icon"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "show-control-icons",
        builder.get_object("show-control-icons"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "show-playpause-icon",
        builder.get_object("show-playpause-icon"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "show-prev-icon",
        builder.get_object("show-prev-icon"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "show-next-icon",
        builder.get_object("show-next-icon"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "show-seperators",
        builder.get_object("show-seperators"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "colored-player-icon",
        builder.get_object("colored-player-icon"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "extension-index",
        builder.get_object("extension-index"),
        "value",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "show-sources-menu",
        builder.get_object("show-sources-menu"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
    settings.bind(
        "cache-images",
        builder.get_object("cache-images"),
        "active",
        Gio.SettingsBindFlags.DEFAULT
    );
};

const initWidgets = () => {
    // Init presets combobox
    presetSepChars.forEach((preset) => {
        widgetPreset.append(preset, preset);
    });
    let savedSepChars = settings.get_strv("seperator-chars");
    let sepChars = `${savedSepChars[0]}...${savedSepChars[1]}`;
    if (presetSepChars.includes(sepChars)) {
        builder.get_object("preset-radio-btn").set_active(true);
        widgetPreset.set_active(presetSepChars.indexOf(sepChars));
        widgetCustom.set_sensitive(false);
    } else {
        builder.get_object("custom-radio-btn").set_active(true);
        widgetCustom.set_text(sepChars);
        widgetPreset.set_active(0);
        widgetPreset.set_sensitive(false);
    }

    // Init extension position combobox
    let widgetExtensionPos = builder.get_object("extension-position");
    positions.forEach((position) => {
        widgetExtensionPos.append(position, position);
    });
    widgetExtensionPos.set_active(positions.indexOf(settings.get_string("extension-position")));

    elementOrder = settings.get_strv("element-order");

    elementIds.forEach((element, index) => {
        let widget = new Gtk.ComboBoxText({
            visible: true,
            can_focus: false,
        });

        elementIds.forEach((_element) => {
            widget.append(_element, elements[_element]);
        });

        widget.set_active(elementIds.indexOf(elementOrder[index]));

        widget.connect("changed", () => {
            let newElementOrder = [];
            elementOrder = settings.get_strv("element-order");
            elementOrderWidgets.forEach((_widget, index) => {
                let val = elementIds[_widget.get_active()];

                if (newElementOrder.includes(val)) {
                    let _index = newElementOrder.indexOf(val);
                    if (elementOrder[_index] === val) {
                        newElementOrder[_index] = elementOrder[index];
                        elementOrderWidgets[_index].set_active(elementIds.indexOf(elementOrder[index]));
                    } else {
                        val = elementOrder[_index];
                        _widget.set_active(elementIds.indexOf(val));
                    }
                }
                newElementOrder.push(val);
            });
            settings.set_strv("element-order", newElementOrder);
        });

        widgetElementOrder.attach(widget, 1, index, 1, 1);
        elementOrderWidgets.push(widget);
    });

    // Init mouse action comboboxes
    // let widgetMouseActionLeft = builder.get_object("mouse-actions-left");
    // let widgetMouseActionRight = builder.get_object("mouse-actions-right");
    // mouseActionNameIds.forEach((action) => {
    //     widgetMouseActionLeft.append(action, mouseActionNamesMap[action]);
    //     widgetMouseActionRight.append(action, mouseActionNamesMap[action]);
    // });
    // widgetMouseActionLeft.set_active(mouseActionNameIds.indexOf(mouseActions[0]));
    // widgetMouseActionRight.set_active(mouseActionNameIds.indexOf(mouseActions[1]));

    trackLabelOptKeys.forEach((opt) => {
        trackLabelStart.append(opt, trackLabelOpts[opt]);
        trackLabelEnd.append(opt, trackLabelOpts[opt]);
    });

    let tracklabelSetting = settings.get_strv("track-label");

    trackLabelSep.set_text(tracklabelSetting[1]);
    trackLabelStart.set_active(trackLabelOptKeys.indexOf(tracklabelSetting[0]));
    trackLabelEnd.set_active(trackLabelOptKeys.indexOf(tracklabelSetting[2]));

    // trackLabelStart.set_active();

    let mouseActions = settings.get_strv("mouse-actions");
    let widgetMouseActionsGrid = builder.get_object("mouse-actions-grid");

    mouseActionLabels.forEach((label, index) => {
        let widgetLabel = new Gtk.Label({
            use_markup: true,
            label,
            visible: true,
            halign: Gtk.Align.START,
        });

        let widgetCombobox = new Gtk.ComboBoxText({
            visible: true,
            halign: Gtk.Align.END,
            can_focus: false,
        });

        mouseActionNameIds.forEach((action) => {
            widgetCombobox.append(action, mouseActionNamesMap[action]);
        });

        widgetCombobox.set_active(mouseActionNameIds.indexOf(mouseActions[index]));

        widgetCombobox.index = index;

        widgetCombobox.connect("changed", (widget) => {
            let currentMouseActions = settings.get_strv("mouse-actions");
            currentMouseActions[widget.index] = mouseActionNameIds[widget.get_active()];
            settings.set_strv("mouse-actions", currentMouseActions);
        });

        widgetMouseActionsGrid.attach(widgetLabel, 0, index, 1, 1);
        widgetMouseActionsGrid.attach(widgetCombobox, 1, index, 1, 1);
    });

    let currentBacklistApps = settings.get_strv("backlist-apps");

    currentBacklistApps.forEach((app) => {
        addToBacklistListBox(app);
    });

    (async () => {
        widgetCacheSize.set_text(await getCacheSize());
    })();
};

const init = () => {
    settings = ExtensionUtils.getSettings();
};

const buildPrefsWidget = () => {
    builder = new Gtk.Builder();
    if (shellVersion < 40) {
        builder.add_from_file(Me.dir.get_path() + "/prefs3.ui");
        builder.connect_signals_full((builder, object, signal, handler) => {
            object.connect(signal, signalHandler[handler].bind(this));
        });
    } else {
        builder.set_scope(new MediaControlsBuilderScope());
        builder.add_from_file(Me.dir.get_path() + "/prefs4.ui");
    }
    widgetPreset = builder.get_object("sepchars-preset");
    widgetCustom = builder.get_object("sepchars-custom");
    trackLabelStart = builder.get_object("track-label-start");
    trackLabelSep = builder.get_object("track-label-sep");
    trackLabelEnd = builder.get_object("track-label-end");
    widgetCacheSize = builder.get_object("cache-size");
    widgetElementOrder = builder.get_object("element-order");

    widgetBacklistBox = builder.get_object("backlist-listbox");

    elementOrderWidgets = [];
    initWidgets();
    bindSettings();
    return builder.get_object("main_prefs");
};

const getCacheSize = async () => {
    // Command: du -hs [data_directory]/media-controls | awk '{NF=1}1'
    try {
        let dir = GLib.get_user_config_dir() + "/media-controls";
        const result = await execCommunicate(["/bin/bash", "-c", `du -hs ${dir} | awk '{NF=1}1'`]);
        return result || "0K";
    } catch (error) {
        logError(error);
    }
};

const addToBacklistListBox = (app) => {
    let box = new Gtk.Box({
        visible: true,
    });

    let label = new Gtk.Label({
        visible: true,
        label: app,
        hexpand: true,
        halign: Gtk.Align.START,
    });

    let deleteButton = Gtk.Button.new_from_icon_name(
        "edit-delete-symbolic",
        Gtk.IconSize.BUTTON || Gtk.IconSize.NORMAL
    );

    deleteButton.visible = true;
    deleteButton.app = app;

    deleteButton.connect("clicked", (widget) => {
        let currentBacklistApps = settings.get_strv("backlist-apps");
        currentBacklistApps.splice(currentBacklistApps.indexOf(widget.app), 1);
        settings.set_strv("backlist-apps", currentBacklistApps);
        widgetBacklistBox.remove(widget.get_parent().get_parent());
    });

    if (shellVersion < 40) {
        box.add(label);
        box.add(deleteButton);
        widgetBacklistBox.insert(box, -1);
    } else {
        box.append(label);
        box.append(deleteButton);
        widgetBacklistBox.append(box);
    }
};
