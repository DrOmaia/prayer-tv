package com.dromaia.prayertv

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.os.storage.StorageVolume
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

// «ملفات الجهاز» on the TV: the folders of the TV's storage and of a USB drive, their sizes, the APK files, and
// deleting what is not needed. The page is never trusted: every path it sends is checked here first (locate, deletable).
object Files {
    private const val LIST_MAX = 2000 // rows of one folder sent to the page
    private const val APK_MAX = 500
    private const val MAX_DEPTH = 40 // a strange tree (a folder linked into itself) cannot be walked for ever

    private class Root(val dir: File, val name: String, val usb: Boolean)
    private class Sum { var bytes = 0L; var files = 0L }
    private class Apk(val path: String, val name: String, val size: Long, val time: Long)

    // a newer filesSizes / filesApks call takes the next number; the older walk sees that and stops
    private val sizeRun = AtomicInteger()
    private val apkRun = AtomicInteger()

    // Android 11+: the special «all files access»; before it the ordinary storage permission
    fun allowed(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else ctx.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    private fun mounted(state: String?): Boolean =
        state == Environment.MEDIA_MOUNTED || state == Environment.MEDIA_MOUNTED_READ_ONLY

    private fun label(ctx: Context, v: StorageVolume): String =
        try { v.getDescription(ctx) ?: "" } catch (_: Exception) { "" }

    // The storages: the TV's own first, then USB drives and SD cards (only those mounted now), each by its
    // canonical path. Not getExternalFilesDirs: it would create an Android/data/<package> folder on the USB drive.
    private fun volumes(ctx: Context): List<Root> {
        val out = ArrayList<Root>()
        fun add(dir: File?, name: String, usb: Boolean, first: Boolean) {
            if (dir == null) return
            val d = try { dir.canonicalFile } catch (_: Exception) { dir.absoluteFile }
            if (out.any { it.dir.path == d.path }) return
            if (first) out.add(0, Root(d, name, usb)) else out.add(Root(d, name, usb))
        }
        val vols: List<StorageVolume> = try {
            (ctx.getSystemService(Context.STORAGE_SERVICE) as StorageManager).storageVolumes
        } catch (_: Exception) { emptyList() }
        if (Build.VERSION.SDK_INT >= 30) {
            for (v in vols) {
                try {
                    if (mounted(v.state)) add(v.directory, label(ctx, v), v.isRemovable, v.isPrimary)
                } catch (_: Exception) {}
            }
        } else {
            // before Android 11 a volume does not say where it is: the internal storage comes from Environment,
            // the others from the hidden StorageVolume.getPath (a volume that refuses is left out)
            if (mounted(Environment.getExternalStorageState())) {
                val primary = vols.firstOrNull { it.isPrimary }
                @Suppress("DEPRECATION")
                val main: File? = Environment.getExternalStorageDirectory()
                add(main, if (primary == null) "" else label(ctx, primary), primary?.isRemovable ?: false, true)
            }
            for (v in vols) {
                try {
                    if (v.isPrimary || !mounted(v.state)) continue
                    val p = StorageVolume::class.java.getMethod("getPath").invoke(v) as? String ?: continue
                    add(File(p), label(ctx, v), v.isRemovable, false)
                } catch (_: Exception) {}
            }
        }
        return out
    }

    private fun within(path: String, root: String): Boolean =
        path == root || path.startsWith(if (root.endsWith("/")) root else "$root/")

    // The page's path as the system sees it («..» and links resolved) and the storage it lies in; null when it
    // is outside every storage. Nothing is listed, measured or deleted before this.
    private fun locate(path: String, roots: List<Root>): Pair<File, Root>? {
        if (path.isEmpty()) return null
        val f = try { File(path).canonicalFile } catch (_: Exception) { return null }
        val root = roots.filter { within(f.path, it.dir.path) }.maxByOrNull { it.dir.path.length } ?: return null
        return Pair(f, root)
    }

    // the path below its storage: "" for the storage itself, "Android/data", "Download/x.apk"
    private fun below(f: File, root: Root): String = f.path.substring(root.dir.path.length).trim('/')

    // Never deleted: a storage itself, its Android folder, Android/data and Android/obb (the apps' own data).
    // The internal storage does not tell capital letters from small ones, so neither does this.
    private fun deletable(path: String, roots: List<Root>): File? {
        val (f, root) = locate(path, roots) ?: return null
        val rel = below(f, root)
        if (rel.isEmpty() || rel.equals("Android", true) || rel.equals("Android/data", true) || rel.equals("Android/obb", true)) return null
        // nor a folder that holds another storage
        if (roots.any { it.dir.path.startsWith(f.path + "/") }) return null
        return f
    }

    fun roots(ctx: Context): String = try {
        val out = JSONArray()
        for (r in volumes(ctx)) {
            out.put(JSONObject().put("p", r.dir.path).put("name", r.name).put("usb", r.usb)
                .put("total", r.dir.totalSpace).put("free", r.dir.usableSpace))
        }
        out.toString()
    } catch (_: Exception) { "[]" }

    private fun err(why: String): String = JSONObject().put("ok", false).put("err", why).toString()

    // One folder, at once (the page waits for it): no sizes of folders here, they come later from sizes()
    fun list(ctx: Context, path: String): String = try {
        listing(ctx, path)
    } catch (_: Exception) { err("denied") }

    private fun listing(ctx: Context, path: String): String {
        val (dir, root) = locate(path, volumes(ctx)) ?: return err("outside")
        if (!allowed(ctx)) return err("denied")
        // null: the folder is not there any more, or the system refuses to show it
        val kids = dir.listFiles() ?: return err(if (dir.exists()) "denied" else "gone")
        val inAndroid = below(dir, root).equals("Android", true)
        val n = minOf(kids.size, LIST_MAX)
        val items = JSONArray()
        for (i in 0 until n) {
            val f = kids[i]
            val isDir = f.isDirectory
            // x: Android/data and Android/obb are shown, but Android 11+ lets no app see inside them
            val closed = isDir && inAndroid && (f.name.equals("data", true) || f.name.equals("obb", true))
            items.put(JSONObject().put("n", f.name).put("d", isDir).put("s", if (isDir) -1L else f.length())
                .put("t", f.lastModified()).put("x", closed))
        }
        return JSONObject().put("ok", true).put("p", dir.path).put("root", root.dir.path)
            .put("items", items).put("more", kids.size - n).toString()
    }

    // everything inside a folder; a folder the system will not list (null) counts as empty
    private fun walk(dir: File, depth: Int, sum: Sum, alive: () -> Boolean) {
        if (depth > MAX_DEPTH) return
        val kids = dir.listFiles() ?: return
        for (f in kids) {
            if (!alive()) return
            if (f.isDirectory) walk(f, depth + 1, sum, alive)
            else { sum.bytes += f.length(); sum.files++ }
        }
    }

    // The size of each folder inside `path`: one answer per folder as its walk ends (by name, so the rows the
    // owner sees first are filled first), then "" after the last. A walk that a newer call stopped says nothing more.
    fun sizes(ctx: Context, path: String, answer: (String) -> Unit) {
        val run = sizeRun.incrementAndGet()
        thread(isDaemon = true) {
            try {
                val dir = locate(path, volumes(ctx))?.first
                val kids = dir?.listFiles()?.take(LIST_MAX)?.filter { it.isDirectory }?.sortedBy { it.name.lowercase() }
                    ?: emptyList()
                for (k in kids) {
                    val sum = Sum()
                    walk(k, 0, sum) { sizeRun.get() == run }
                    if (sizeRun.get() != run) return@thread
                    answer(JSONObject().put("n", k.name).put("s", sum.bytes).put("c", sum.files).toString())
                }
            } catch (_: Exception) {}
            if (sizeRun.get() == run) answer("")
        }
    }

    private fun search(dir: File, depth: Int, found: MutableList<Apk>, alive: () -> Boolean) {
        if (depth > MAX_DEPTH) return
        val kids = dir.listFiles() ?: return
        for (f in kids) {
            if (!alive()) return
            if (f.isDirectory) search(f, depth + 1, found, alive)
            else if (f.name.endsWith(".apk", ignoreCase = true)) found.add(Apk(f.path, f.name, f.length(), f.lastModified()))
        }
    }

    // every APK file on every storage, the biggest first
    fun apks(ctx: Context, answer: (String) -> Unit) {
        val run = apkRun.incrementAndGet()
        thread(isDaemon = true) {
            val out = JSONArray()
            try {
                val found = ArrayList<Apk>()
                for (r in volumes(ctx)) search(r.dir, 0, found) { apkRun.get() == run }
                for (a in found.sortedByDescending { it.size }.take(APK_MAX)) {
                    out.put(JSONObject().put("p", a.path).put("n", a.name).put("s", a.size).put("t", a.time))
                }
            } catch (_: Exception) {}
            if (apkRun.get() == run) answer(out.toString())
        }
    }

    private fun isLink(f: File): Boolean = try { f.canonicalPath != f.absolutePath } catch (_: Exception) { true }

    // children first; the bytes of every file that really went are added to sum
    private fun remove(f: File, depth: Int, sum: Sum) {
        if (!f.isDirectory) {
            val n = f.length()
            if (f.delete()) sum.bytes += n
        } else if (isLink(f)) {
            // a link to a folder goes as a link: what it points to may be outside the storage
            f.delete()
        } else {
            // deeper than the cap: left alone, so its folders stay and the item is reported as not deleted
            if (depth <= MAX_DEPTH) {
                f.listFiles()?.forEach { k -> try { remove(k, depth + 1, sum) } catch (_: Exception) {} }
            }
            f.delete()
        }
    }

    // Deletes the paths of a JSON array (a folder with everything inside). Never stopped half-way by a newer call;
    // one path that fails does not stop the others. An item counts as deleted only when it is not there afterwards.
    fun delete(ctx: Context, json: String, answer: (String) -> Unit) {
        thread(isDaemon = true) {
            var ok = 0
            val fail = JSONArray()
            val sum = Sum()
            try {
                val paths = JSONArray(json)
                val roots = volumes(ctx)
                for (i in 0 until paths.length()) {
                    val p = paths.optString(i)
                    try {
                        val f = deletable(p, roots)
                        if (f != null) remove(f, 0, sum)
                        if (f != null && !f.exists()) ok++ else fail.put(p)
                    } catch (_: Exception) { fail.put(p) }
                }
            } catch (_: Exception) {}
            answer(try {
                JSONObject().put("ok", ok).put("fail", fail).put("freed", sum.bytes).toString()
            } catch (_: Exception) { """{"ok":0,"fail":[],"freed":0}""" })
        }
    }
}
