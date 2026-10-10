using Dalamud.Bindings.ImGui;
using Dalamud.Game.Text.SeStringHandling;
using Dalamud.Game.Text.SeStringHandling.Payloads;
using Dalamud.Plugin;
using Dalamud.Plugin.Ipc;
using Dalamud.Plugin.Services;

namespace Chatpendium;

internal sealed class ChatTwoIntegration : IDisposable
{
    private readonly ICallGateSubscriber<string> register;
    private readonly ICallGateSubscriber<string, object?> unregister;
    private readonly ICallGateSubscriber<object?> available;
    private readonly ICallGateSubscriber<string, PlayerPayload?, ulong, Payload?, SeString?, SeString?, object?> invoke;
    private readonly Action<string?> open;
    private readonly IPluginLog log;
    private string? registration;

    internal ChatTwoIntegration(IDalamudPluginInterface pi, IPluginLog log, Action<string?> open)
    {
        this.open = open;
        this.log = log;
        register = pi.GetIpcSubscriber<string>("ChatTwo.Register");
        unregister = pi.GetIpcSubscriber<string, object?>("ChatTwo.Unregister");
        available = pi.GetIpcSubscriber<object?>("ChatTwo.Available");
        invoke = pi.GetIpcSubscriber<string, PlayerPayload?, ulong, Payload?, SeString?, SeString?, object?>("ChatTwo.Invoke");
        available.Subscribe(Register);
        invoke.Subscribe(DrawMenu);
        Register();
    }

    private void Register()
    {
        Unregister();
        if (!register.HasFunction) return; // Chat 2 is optional and can load later.
        try { registration = register.InvokeFunc(); }
        catch (Exception ex) { log.Debug($"Chat 2 registration unavailable: {ex.Message}"); }
    }

    private void Unregister()
    {
        var old = registration;
        registration = null;
        if (old == null || !unregister.HasAction) return;
        try { unregister.InvokeAction(old); }
        catch (Exception ex) { log.Debug($"Chat 2 unregistration unavailable: {ex.Message}"); }
    }

    private void DrawMenu(string id, PlayerPayload? sender, ulong contentId, Payload? payload, SeString? senderString, SeString? content)
    {
        if (id != registration) return;
        if (ImGui.Selectable("Open Chatpendium")) open(null);
        var text = content?.TextValue;
        // Search locally: chat content is never sent to the website.
        if (!string.IsNullOrWhiteSpace(text) && System.Text.Encoding.UTF8.GetByteCount(text) <= 1024
            && ImGui.Selectable("Search message in Chatpendium")) open(text);
    }

    public void Dispose()
    {
        available.Unsubscribe(Register);
        invoke.Unsubscribe(DrawMenu);
        Unregister();
    }
}
