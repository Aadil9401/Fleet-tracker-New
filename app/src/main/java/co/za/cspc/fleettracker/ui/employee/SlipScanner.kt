package co.za.cspc.fleettracker.ui.employee

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import co.za.cspc.fleettracker.data.model.FuelSlip
import co.za.cspc.fleettracker.data.model.ScannedSlip
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.tasks.await
import java.io.File

/**
 * Photographing a fuel slip and reading the figures off it.
 *
 * The photo is a means, not a record. It is written to the cache, read once, and
 * deleted — see [deleteSlipPhoto], which every path calls. Receipt images used to be
 * uploaded and kept, and were removed because there is nowhere to keep them; scanning
 * exists to save the employee typing, not to reintroduce storage by the back door.
 *
 * Recognition is on-device and the model is bundled into the APK, so a slip scans on a
 * forecourt with no signal. Nothing about the photo or the text leaves the phone.
 */

/** Where this capture will be written. A fresh name per scan, so two never collide. */
fun newSlipPhoto(context: Context): File {
    val dir = File(context.cacheDir, "fuel_receipts").apply { mkdirs() }
    return File(dir, "slip-${System.currentTimeMillis()}.jpg")
}

/**
 * The content:// URI to hand the camera app. A file:// URI would be rejected outright
 * on anything since Android 7, and the authority and cache path are already declared
 * in the manifest and res/xml/file_paths.xml.
 */
fun slipPhotoUri(context: Context, photo: File): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", photo)

/** Best effort: a cache file left behind is harmless, a crash on cleanup is not. */
fun deleteSlipPhoto(photo: File?) {
    runCatching { photo?.delete() }
}

/**
 * Reads a photographed slip. Returns an empty [ScannedSlip] if the image yields no
 * text at all, and throws only if the image itself could not be opened.
 */
suspend fun scanFuelSlip(context: Context, image: Uri): ScannedSlip {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    return try {
        val recognised = recognizer.process(InputImage.fromFilePath(context, image)).await()
        FuelSlip.read(recognised.text)
    } finally {
        recognizer.close()
    }
}
