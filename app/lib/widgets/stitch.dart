import 'package:material_ui/material_ui.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Línea de hilván: puntadas largas, el mismo trazo del logo.
class StitchDivider extends StatelessWidget {
  const StitchDivider({super.key, this.color});

  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 12,
      width: double.infinity,
      child: CustomPaint(painter: _StitchPainter(color ?? Theme.of(context).colorScheme.secondary)),
    );
  }
}

class _StitchPainter extends CustomPainter {
  _StitchPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    const stitch = 14.0;
    const gap = 9.0;
    final y = size.height / 2;
    for (var x = 0.0; x < size.width; x += stitch + gap) {
      canvas.drawLine(Offset(x, y), Offset((x + stitch).clamp(0, size.width), y), paint);
    }
  }

  @override
  bool shouldRepaint(_StitchPainter oldDelegate) => oldDelegate.color != color;
}

/// Estado vacío con el símbolo de la marca, sin ilustraciones genéricas.
class StitchEmptyState extends StatelessWidget {
  const StitchEmptyState({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SvgPicture.asset('assets/brand/simbolo.svg', width: 88, height: 88, excludeFromSemantics: true),
              const SizedBox(height: 20),
              const StitchDivider(),
              const SizedBox(height: 20),
              Text(message, textAlign: TextAlign.center, style: theme.textTheme.bodyLarge),
            ],
          ),
        ),
      ),
    );
  }
}

/// Logo horizontal con el nombre, para la pantalla de entrada.
class HilvanaLogo extends StatelessWidget {
  const HilvanaLogo({super.key, this.height = 64});

  final double height;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return SvgPicture.asset(
      dark ? 'assets/brand/logo-oscuro.svg' : 'assets/brand/logo.svg',
      height: height,
      semanticsLabel: 'Hilvana',
    );
  }
}
