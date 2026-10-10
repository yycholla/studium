using Dalamud.Game.Command;
using Dalamud.Interface.Windowing;
using Dalamud.IoC;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;

namespace Chatpendium;

public sealed class Plugin : IDalamudPlugin
{
    [PluginService] internal static IDalamudPluginInterface PluginInterface { get; private set; } = null!;
    [PluginService] internal static ICommandManager Commands { get; private set; } = null!;
    [PluginService] internal static IPluginLog Log { get; private set; } = null!;
    private readonly WindowSystem windows = new("Chatpendium");
    private readonly NativeCore core;
    private readonly CatalogStore catalog;
    private readonly PickerWindow picker;
    private readonly ChatTwoIntegration chatTwo;

    public Plugin()
    {
        var config = PluginInterface.GetPluginConfig() as Configuration ?? new Configuration();
        config.Favorites ??= [];
        config.Favorites = config.Favorites.Where(id => !string.IsNullOrWhiteSpace(id) && id.Length <= 64).Take(4096).ToHashSet();
        core = new NativeCore(PluginInterface.AssemblyLocation.Directory!.FullName);
        CatalogStore? initializingCatalog = null;
        ChatTwoIntegration? initializingIntegration = null;
        var registeredCommand = false;
        try
        {
            catalog = initializingCatalog = new CatalogStore(core, PluginInterface.GetPluginConfigDirectory(), Log);
            picker = new PickerWindow(core, catalog, config, () => PluginInterface.SavePluginConfig(config));
            chatTwo = initializingIntegration = new ChatTwoIntegration(PluginInterface, Log, picker.Open);
            windows.AddWindow(picker);
            registeredCommand = Commands.AddHandler("/chatpendium", new CommandInfo(OnCommand) { HelpMessage = "Open Chatpendium. Optional: /chatpendium <search words>" });
            if (!registeredCommand) throw new InvalidOperationException("The /chatpendium command is already registered.");
            PluginInterface.UiBuilder.Draw += Draw;
            PluginInterface.UiBuilder.OpenMainUi += Open;
        }
        catch
        {
            PluginInterface.UiBuilder.Draw -= Draw;
            PluginInterface.UiBuilder.OpenMainUi -= Open;
            if (registeredCommand) Commands.RemoveHandler("/chatpendium");
            initializingIntegration?.Dispose();
            windows.RemoveAllWindows();
            initializingCatalog?.Dispose();
            core.Dispose();
            throw;
        }
    }

    private void OnCommand(string command, string arguments) => picker.Open(arguments);
    private void Open() => picker.Open();
    private void Draw() { catalog.Update(); windows.Draw(); }

    public void Dispose()
    {
        PluginInterface.UiBuilder.Draw -= Draw;
        PluginInterface.UiBuilder.OpenMainUi -= Open;
        Commands.RemoveHandler("/chatpendium");
        chatTwo.Dispose();
        windows.RemoveAllWindows();
        catalog.Dispose();
        core.Dispose();
    }
}
