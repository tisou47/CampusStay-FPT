import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
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

/// Downloads "My data" (`GET /students/me/privacy/export`, D3) as `my-data.json` and opens it in a viewer on the phone.
Future<void> openMyData() async {
  try {
    final bytes = await Api.download('/students/me/privacy/export');
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/my-data.json');
    await file.writeAsBytes(bytes, flush: true);
    final result = await OpenFilex.open(file.path, type: 'application/json');
    if (result.type != ResultType.done) {
      toast(t('No app on this phone opens JSON files.', 'Máy chưa có ứng dụng mở tệp JSON.'), error: true);
    }
  } catch (e) {
    toast('$e', error: true);
  }
}

/// A file the student picked: its name and its path on the phone.
typedef Picked = ({String name, String path});

/// What the API accepts (MOB-05): no HEIC or WebP, which the back office cannot show everywhere.
const _imageTypes = ['jpg', 'jpeg', 'png'];

/// The API's upload limit (MOB-06): a larger file is refused here instead of failing after a long upload.
const maxUploadBytes = 5 * 1024 * 1024;

bool _fits(({String name, String path}) f) {
  if (File(f.path).lengthSync() <= maxUploadBytes) return true;
  toast(
    t('{name} is larger than 5 MB. Take the photo again at a lower resolution.', '{name} lớn hơn 5 MB. Hãy chụp lại ở độ phân giải thấp hơn.')
        .replaceAll('{name}', f.name),
    error: true,
  );
  return false;
}

/// Lets the student pick images (maintenance photos), up to [max].
Future<List<Picked>> pickImages(int max) async {
  final result = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: _imageTypes);
  return [
    for (final f in result)
      if (f.path != null && _fits((name: f.name, path: f.path!))) (name: f.name, path: f.path!),
  ].take(max).toList();
}

/// Lets the student pick one document: an image or a PDF (late check-in evidence).
Future<Picked?> pickDocument() async {
  final f = await FilePicker.pickFile(
    type: FileType.custom,
    allowedExtensions: [..._imageTypes, 'pdf'],
  );
  final path = f?.path;
  return path == null || !_fits((name: f!.name, path: path)) ? null : (name: f.name, path: path);
}

const _secureWindow = MethodChannel('campusstay/secure');

/// Marks the window secure (Android `FLAG_SECURE`: no screenshots, screen recording or recent-apps thumbnail) while
/// something secret is on screen, the door code (MOB-17). `MainActivity` answers the channel.
Future<void> secureScreen(bool on) async {
  try {
    await _secureWindow.invokeMethod<void>('setSecure', on);
  } on MissingPluginException {
    // tests and non-Android hosts
  } on PlatformException {
    // best effort
  }
}
