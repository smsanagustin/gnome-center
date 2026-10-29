import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

function reparent(actor, parent, index = -1) {
    actor.get_parent()?.remove_child(actor);
    parent.insert_child_at_index(actor, index);
}

export default class GnomeCenter extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._box = new St.BoxLayout({
            style_class: 'gnome-center',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
        });
        this._backdrop = new St.Widget({reactive: true, visible: false});
        this._backdrop.add_child(this._box);
        this._backdrop.connect('button-press-event', (_actor, event) => {
            if (!this._box.contains(global.stage.get_event_actor(event)))
                this._close();
        });
        this._backdrop.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS ||
                event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this._close();
            return Clutter.EVENT_STOP;
        });
        Main.layoutManager.addTopChrome(this._backdrop);

        Main.wm.addKeybinding('toggle-gnome-center', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP,
            () => this._toggle());
        Main.overview.connectObject('showing', () => this._close(), this);
    }

    disable() {
        this._close();
        Main.wm.removeKeybinding('toggle-gnome-center');
        Main.overview.disconnectObject(this);
        this._backdrop.destroy();
        this._backdrop = this._box = this._settings = null;
    }

    _toggle() {
        if (this._grab)
            this._close();
        else if (!Main.overview.visible && !global.display.is_grabbed())
            this._open();
    }

    _open() {
        const {searchEntry: entry, searchController: search} = Main.overview;
        this._borrowed = [entry, search].map(actor => {
            const parent = actor.get_parent();
            const index = parent.get_children().indexOf(actor);
            reparent(actor, this._box);
            return [actor, parent, index];
        });
        const scrollView = search._searchResults._scrollView;
        scrollView.overlay_scrollbars = false;

        this._grids = search._searchResults._providers.map(p => p.display?._grid).filter(Boolean);
        for (const grid of this._grids) {
            grid.get_parent().connectObject('notify::allocation', () => {
                const tiles = grid.get_children().map(t => t.allocation).filter(b => b.get_width() > 0);
                if (!tiles.length)
                    return;
                const center = (Math.min(...tiles.map(b => b.x1)) + Math.max(...tiles.map(b => b.x2))) / 2;
                const [gridX] = grid.get_transformed_position();
                const [viewX] = scrollView.get_transformed_position();
                grid.translation_x += Math.round(viewX + scrollView.width / 2 - gridX - center);
            }, this);
        }

        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const [width, height] = ['width', 'height'].map(k => this._settings.get_int(k) * scale);
        const alpha = 1 - this._settings.get_int('transparency') / 100;
        const monitor = Main.layoutManager.currentMonitor;
        this._backdrop.set_position(monitor.x, monitor.y);
        this._backdrop.set_size(monitor.width, monitor.height);
        this._box.set_position(
            Math.round((monitor.width - width) / 2),
            Math.round((monitor.height - height) / 2));
        this._box.width = width;
        this._box.style = `background-color: rgba(34, 34, 38, ${alpha});`;

        const fit = () => (this._box.height = search.visible ? height : -1);
        search.connectObject('notify::visible', fit, this);
        fit();

        Main.overview.toggle = Main.overview.hide = () => this._close();
        this._backdrop.show();
        this._grab = Main.pushModal(this._backdrop, {actionMode: Shell.ActionMode.POPUP});
        entry.clutter_text.set_input_interceptor(this._backdrop);
        entry.grab_key_focus();
    }

    _close() {
        if (!this._grab)
            return;
        const {searchEntry: entry, searchController: search} = Main.overview;
        this._backdrop.hide();
        entry.clutter_text.set_input_interceptor(null);
        search.disconnectObject(this);
        for (const [actor, parent, index] of this._borrowed)
            reparent(actor, parent, index);
        search.set({visible: false, opacity: 0});
        search._searchResults._scrollView.overlay_scrollbars = true;
        for (const grid of this._grids) {
            grid.get_parent().disconnectObject(this);
            grid.translation_x = 0;
        }
        delete Main.overview.toggle;
        delete Main.overview.hide;
        Main.popModal(this._grab);
        this._grab = this._borrowed = this._grids = null;
    }
}
