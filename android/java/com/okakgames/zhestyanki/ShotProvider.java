package com.okakgames.zhestyanki;

// Отдаёт один файл — кадр победы — другим приложениям, когда игрок жмёт «Поделиться».

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class ShotProvider extends ContentProvider {

    static final String AUTHORITY = "com.okakgames.zhestyanki.shots";
    static final String DIR = "share";
    static final String NAME = "zhestyanki.png";

    private File shot() {
        return new File(new File(getContext().getCacheDir(), DIR), NAME);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = shot();
        if (!f.exists()) throw new FileNotFoundException(NAME);
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] args, String order) {
        File f = shot();
        MatrixCursor c = new MatrixCursor(new String[]{ OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        c.addRow(new Object[]{ NAME, Long.valueOf(f.length()) });
        return c;
    }

    @Override
    public String getType(Uri uri) {
        return "image/png";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String sel, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String sel, String[] args) {
        return 0;
    }
}
