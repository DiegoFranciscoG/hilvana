import 'package:material_ui/material_ui.dart';

import '../data/repositories.dart';
import '../push.dart';
import '../strings.dart';
import '../widgets/stitch.dart';

/// Ajustes: cuenta, avisos y eliminación de cuenta dentro de la app (Apple 5.1.1(v), Google Play).
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key, required this.auth, required this.inbox, this.push, required this.onDeleted});

  final AuthRepository auth;
  final InboxRepository inbox;
  final PushService? push;
  final VoidCallback onDeleted;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _deleting = false;
  bool _pushEnabled = false;

  Future<void> _confirmDelete() async {
    final strings = StringsScope.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(strings.t('deleteAccountTitle')),
        content: Text(strings.t('deleteAccountBody')),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(strings.t('cancel'))),
          FilledButton(
            key: const Key('confirm-delete'),
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(strings.t('deleteConfirm')),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _deleting = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.inbox.deleteAccount();
      messenger.showSnackBar(SnackBar(content: Text(strings.t('deleted'))));
      widget.onDeleted();
    } catch (_) {
      if (!mounted) return;
      setState(() => _deleting = false);
      messenger.showSnackBar(SnackBar(content: Text(strings.t('deleteFailed'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = StringsScope.of(context);
    final theme = Theme.of(context);
    final pushAvailable = widget.push?.available ?? false;
    return Scaffold(
      appBar: AppBar(title: Text(strings.t('settings'))),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: [
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: Text(strings.t('account')),
            subtitle: Text(widget.auth.email ?? ''),
          ),
          SwitchListTile(
            secondary: const Icon(Icons.notifications_none),
            title: Text(strings.t('notifications')),
            subtitle: Text(pushAvailable ? strings.t('notificationsBody') : strings.t('notificationsUnavailable')),
            value: _pushEnabled,
            onChanged: pushAvailable
                ? (on) async {
                    if (!on) {
                      setState(() => _pushEnabled = false);
                      return;
                    }
                    final ok = await widget.push!.enable();
                    if (mounted) setState(() => _pushEnabled = ok);
                  }
                : null,
          ),
          ListTile(
            leading: const Icon(Icons.shield_outlined),
            title: Text(strings.t('privacy')),
            subtitle: Text(strings.t('privacyBody')),
          ),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8), child: StitchDivider()),
          ListTile(
            leading: const Icon(Icons.logout),
            title: Text(strings.t('signOut')),
            onTap: () => widget.auth.signOut(),
          ),
          ListTile(
            key: const Key('delete-account'),
            leading: Icon(Icons.delete_outline, color: theme.colorScheme.error),
            title: Text(
              _deleting ? strings.t('deleting') : strings.t('deleteAccount'),
              style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.error),
            ),
            onTap: _deleting ? null : _confirmDelete,
          ),
        ],
      ),
    );
  }
}
