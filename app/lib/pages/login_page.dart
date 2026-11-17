import 'package:material_ui/material_ui.dart';

import '../data/repositories.dart';
import '../strings.dart';
import '../widgets/stitch.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.auth});

  final AuthRepository auth;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final strings = StringsScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.auth.signIn(_email.text, _password.text);
    } catch (_) {
      if (mounted) setState(() => _error = strings.t('loginError'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = StringsScope.of(context);
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: HilvanaLogo(height: 72)),
                    const SizedBox(height: 8),
                    Text(strings.t('tagline'), textAlign: TextAlign.center, style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 28),
                    const StitchDivider(),
                    const SizedBox(height: 28),
                    Text(strings.t('loginTitle'), style: theme.textTheme.headlineSmall),
                    const SizedBox(height: 16),
                    TextField(
                      key: const Key('login-email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      decoration: InputDecoration(labelText: strings.t('email')),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      key: const Key('login-password'),
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: InputDecoration(labelText: strings.t('password')),
                      onSubmitted: (_) => _busy ? null : _submit(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      key: const Key('login-submit'),
                      onPressed: _busy ? null : _submit,
                      child: Text(_busy ? strings.t('signingIn') : strings.t('signIn')),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
