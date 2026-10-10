using System.Numerics;
using System.Text.Json;
using Dalamud.Bindings.ImGui;
using Dalamud.Interface.Windowing;

namespace Chatpendium;

internal sealed class PickerWindow : Window
{
    private readonly NativeCore core;
    private readonly CatalogStore catalog;
    private readonly Configuration config;
    private readonly Action save;
    private string query = "";
    private string category = "";
    private bool asciiOnly;
    private bool favoritesOnly;
    private bool dirty = true;
    private bool focusSearch;
    private int catalogRevision = -1;
    private Entry[] entries = [];
    private Category[] categories = [];
    private string status = "Choose Copy, then paste into chat.";

    internal PickerWindow(NativeCore core, CatalogStore catalog, Configuration config, Action save)
        : base("Chatpendium · The Studium###Chatpendium")
    {
        this.core = core;
        this.catalog = catalog;
        this.config = config;
        this.save = save;
        Size = new Vector2(600, 480);
        SizeCondition = ImGuiCond.FirstUseEver;
        SizeConstraints = new WindowSizeConstraints { MinimumSize = new Vector2(420, 300), MaximumSize = new Vector2(float.MaxValue) };
    }

    internal void Open(string? search = null)
    {
        if (search != null)
        {
            query = search;
            category = "";
            favoritesOnly = false;
            asciiOnly = false;
            dirty = true;
        }
        IsOpen = true;
        focusSearch = true;
    }

    public override void Draw()
    {
        ImGui.TextUnformatted("A face for every party.");
        if (focusSearch) { ImGui.SetKeyboardFocusHere(); focusSearch = false; }
        ImGui.SetNextItemWidth(-1);
        dirty |= ImGui.InputTextWithHint("##Search", "Search names, moods, or symbols", ref query, 1024);
        dirty |= ImGui.Checkbox("Favorites", ref favoritesOnly);
        ImGui.SameLine();
        dirty |= ImGui.Checkbox("ASCII only", ref asciiOnly);
        var label = categories.FirstOrDefault(c => c.Id == category)?.Name ?? "All categories";
        if (ImGui.BeginCombo("Category", label))
        {
            if (ImGui.Selectable("All categories", category == "")) { category = ""; dirty = true; }
            foreach (var option in categories)
                if (ImGui.Selectable(option.Name, category == option.Id)) { category = option.Id; dirty = true; }
            ImGui.EndCombo();
        }
        if (dirty || catalogRevision != catalog.Revision) Search();
        ImGui.TextUnformatted($"{entries.Length} expressions · {catalog.Status}");
        if (!catalog.Refreshing && ImGui.SmallButton("Refresh catalog")) catalog.Refresh();
        if (catalog.Refreshing) ImGui.TextUnformatted("Checking for catalog updates...");
        ImGui.PushTextWrapPos();
        ImGui.TextUnformatted(status);
        ImGui.PopTextWrapPos();
        ImGui.Separator();

        if (entries.Length == 0) ImGui.TextUnformatted("No matches. Try another word or clear the filters.");
        if (!ImGui.BeginTable("Expressions", 3, ImGuiTableFlags.RowBg | ImGuiTableFlags.ScrollY, new Vector2(0, -28))) return;
        ImGui.TableSetupColumn("Expression", ImGuiTableColumnFlags.WidthStretch);
        ImGui.TableSetupColumn("Copy", ImGuiTableColumnFlags.WidthFixed, 60);
        ImGui.TableSetupColumn("Favorite", ImGuiTableColumnFlags.WidthFixed, 70);
        foreach (var entry in entries)
        {
            ImGui.PushID(entry.Id);
            ImGui.TableNextRow();
            ImGui.TableNextColumn();
            ImGui.TextUnformatted(entry.Text);
            ImGui.TextUnformatted(entry.Name);
            ImGui.TableNextColumn();
            if (ImGui.Button("Copy"))
            {
                ImGui.SetClipboardText(entry.Text);
                status = $"Copied {entry.Name}. Paste into your chat draft.";
            }
            ImGui.TableNextColumn();
            var favorite = config.Favorites.Contains(entry.Id);
            if (ImGui.Button(favorite ? "Saved" : "Save"))
            {
                if (!favorite && config.Favorites.Count >= 4096)
                {
                    status = "Your favorites are full. Remove a saved expression first.";
                    ImGui.PopID();
                    continue;
                }
                if (favorite) config.Favorites.Remove(entry.Id); else config.Favorites.Add(entry.Id);
                dirty = true;
                try { save(); }
                catch (Exception) { status = "Favorite changed for this session; settings could not be saved."; }
            }
            ImGui.PopID();
        }
        ImGui.EndTable();
        ImGui.TextDisabled("Text compatibility is community documented; appearance varies by font.");
    }

    private void Search()
    {
        dirty = false;
        catalogRevision = catalog.Revision;
        try
        {
            var result = core.Call(new {
                op = "search", catalog = catalog.Catalog,
                filter = new { query, category, ascii_only = asciiOnly, favorites_only = favoritesOnly, favorites = config.Favorites }
            }).Deserialize<SearchResult>(NativeCore.JsonOptions)!;
            entries = result.Entries;
            categories = result.Categories;
        }
        catch (Exception ex)
        {
            entries = [];
            status = $"Search could not be completed: {ex.Message}";
        }
    }
}
