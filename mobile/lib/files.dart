import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'common.dart';

/// Opens a web page (the dormitory rules, a Term document) in the phone's browser.
Future<void> openUrl(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null || !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
    toast(t('Could not open the link.', 'Không mở được liên kết.'), error: true);
  }
}

/// Downloads the receipt PDF of a paid Invoice (`GET /invoices/{id}/receipt`) and opens it in the PDF viewer.
Future<void> openReceipt(String invoiceId) async {
  try {
    final bytes = await Api.download('/invoices/${Uri.encodeComponent(invoiceId)}/receipt');
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/receipt-$invoiceId.pdf');
    await file.writeAsBytes(bytes, flush: true);
    final result = await OpenFilex.open(file.path, type: 'application/pdf');
    if (result.type != ResultType.done) {
      toast(t('No app on this phone opens PDF files.', 'Máy chưa có ứng dụng mở tệp PDF.'), error: true);
    }
  } catch (e) {
    toast('$e', error: true);
  }
}

/// A file the student picked: its name and its path on the phone.
typedef Picked = ({String name, String path});

/// Lets the student pick images (maintenance photos), up to [max].
Future<List<Picked>> pickImages(int max) async {
  final result = await FilePicker.pickFiles(type: FileType.image);
  return [
    for (final f in result)
      if (f.path != null) (name: f.name, path: f.path!),
  ].take(max).toList();
}

/// Lets the student pick one document: an image or a PDF (late check-in evidence).
Future<Picked?> pickDocument() async {
  final f = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf'],
  );
  final path = f?.path;
  return path == null ? null : (name: f!.name, path: path);
}
