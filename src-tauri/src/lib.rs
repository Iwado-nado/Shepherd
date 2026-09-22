use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};
use tauri::Manager;

#[tauri::command]
fn read_project_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(path)).map_err(|error| error.to_string())
}

#[tauri::command]
fn project_file_modified_at(path: String) -> Result<u64, String> {
    let path = PathBuf::from(path);
    fs::metadata(&path).map_err(|error| error.to_string())?;
    Ok(modified_at_millis(&path))
}

fn backup_path(destination: &Path, generation: u8) -> PathBuf {
    let mut name = destination.as_os_str().to_os_string();
    name.push(format!(".backup{generation}"));
    PathBuf::from(name)
}

fn rotate_backups(destination: &Path) -> Result<(), String> {
    let oldest = backup_path(destination, 3);
    if oldest.exists() {
        fs::remove_file(&oldest).map_err(|error| error.to_string())?;
    }
    for generation in (1..3).rev() {
        let source = backup_path(destination, generation);
        if source.exists() {
            fs::rename(&source, backup_path(destination, generation + 1))
                .map_err(|error| error.to_string())?;
        }
    }
    if destination.exists() {
        fs::copy(destination, backup_path(destination, 1)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn write_text_atomic(destination: &Path, contents: &str) -> Result<(), String> {
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));

    if !parent.is_dir() {
        return Err("The destination directory does not exist.".to_string());
    }

    let mut temporary = tempfile::Builder::new()
        .prefix(".shepherd-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| error.to_string())?;

    temporary
        .write_all(contents.as_bytes())
        .and_then(|_| temporary.flush())
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| error.to_string())?;

    temporary
        .persist(destination)
        .map_err(|error| error.error.to_string())?;

    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn write_project_file_atomic(
    path: String,
    contents: String,
    create_backup: bool,
) -> Result<(), String> {
    let destination = PathBuf::from(path);
    if create_backup {
        rotate_backups(&destination)?;
    }
    write_text_atomic(&destination, &contents)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryFileEntry {
    path: String,
    contents: String,
    modified_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupFileEntry {
    generation: u8,
    path: String,
    modified_at: u64,
}

fn modified_at_millis(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn recovery_directory(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("recovery"))
        .map_err(|error| error.to_string())
}

fn recovery_path(directory: &Path, project_id: &str) -> PathBuf {
    let filename = format!(
        "{}.recovery.json",
        URL_SAFE_NO_PAD.encode(project_id.as_bytes())
    );
    directory.join(filename)
}

#[tauri::command]
fn write_recovery_file(
    app: tauri::AppHandle,
    project_id: String,
    contents: String,
) -> Result<(), String> {
    let directory = recovery_directory(&app)?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    write_text_atomic(&recovery_path(&directory, &project_id), &contents)
}

#[tauri::command]
fn list_recovery_files(app: tauri::AppHandle) -> Result<Vec<RecoveryFileEntry>, String> {
    let directory = recovery_directory(&app)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for item in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let path = item.map_err(|error| error.to_string())?.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        entries.push(RecoveryFileEntry {
            modified_at: modified_at_millis(&path),
            path: path.to_string_lossy().into_owned(),
            contents,
        });
    }
    entries.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    Ok(entries)
}

#[tauri::command]
fn delete_recovery_file(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let path = recovery_path(&recovery_directory(&app)?, &project_id);
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn list_project_backups(path: String) -> Result<Vec<BackupFileEntry>, String> {
    let destination = PathBuf::from(path);
    let mut entries = Vec::new();
    for generation in 1..=3 {
        let path = backup_path(&destination, generation);
        if path.is_file() {
            entries.push(BackupFileEntry {
                generation,
                modified_at: modified_at_millis(&path),
                path: path.to_string_lossy().into_owned(),
            });
        }
    }
    Ok(entries)
}

#[tauri::command]
fn write_binary_file_atomic(path: String, base64_data: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(base64_data)
        .map_err(|error| error.to_string())?;
    let destination = PathBuf::from(path);
    let parent = destination
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    if !parent.is_dir() {
        return Err("The destination directory does not exist.".to_string());
    }
    let mut temporary = tempfile::Builder::new()
        .prefix(".shepherd-export-")
        .suffix(".tmp")
        .tempfile_in(parent)
        .map_err(|error| error.to_string())?;
    temporary
        .write_all(&bytes)
        .and_then(|_| temporary.flush())
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| error.to_string())?;
    temporary
        .persist(&destination)
        .map_err(|error| error.error.to_string())?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_project_file,
            project_file_modified_at,
            write_project_file_atomic,
            write_recovery_file,
            list_recovery_files,
            delete_recovery_file,
            list_project_backups,
            write_binary_file_atomic
        ])
        .run(tauri::generate_context!())
        .expect("error while running Shepherd");
}

#[cfg(test)]
mod tests {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    use super::{
        backup_path, read_project_file, recovery_path, write_binary_file_atomic,
        write_project_file_atomic, write_text_atomic,
    };

    #[test]
    fn atomic_write_replaces_an_existing_project() {
        let directory = tempfile::tempdir().expect("create temp directory");
        let destination = directory.path().join("project.storyflow");
        std::fs::write(&destination, "old").expect("write initial file");

        write_project_file_atomic(
            destination.to_string_lossy().into_owned(),
            "new project".to_string(),
            true,
        )
        .expect("replace project");

        let contents =
            read_project_file(destination.to_string_lossy().into_owned()).expect("read project");
        assert_eq!(contents, "new project");
        assert_eq!(
            std::fs::read_to_string(backup_path(&destination, 1)).unwrap(),
            "old"
        );
    }

    #[test]
    fn backups_are_rotated_to_three_generations() {
        let directory = tempfile::tempdir().expect("create temp directory");
        let destination = directory.path().join("project.storyflow");
        for version in 0..5 {
            write_project_file_atomic(
                destination.to_string_lossy().into_owned(),
                format!("version {version}"),
                true,
            )
            .expect("write project");
        }
        assert_eq!(
            std::fs::read_to_string(backup_path(&destination, 1)).unwrap(),
            "version 3"
        );
        assert_eq!(
            std::fs::read_to_string(backup_path(&destination, 2)).unwrap(),
            "version 2"
        );
        assert_eq!(
            std::fs::read_to_string(backup_path(&destination, 3)).unwrap(),
            "version 1"
        );
    }

    #[test]
    fn atomic_binary_write_decodes_base64() {
        let directory = tempfile::tempdir().expect("create temp directory");
        let destination = directory.path().join("canvas.png");
        let bytes = [0_u8, 1, 2, 127, 255];

        write_binary_file_atomic(
            destination.to_string_lossy().into_owned(),
            STANDARD.encode(bytes),
        )
        .expect("write binary file");

        assert_eq!(std::fs::read(destination).unwrap(), bytes);
    }

    #[test]
    fn recovery_write_is_atomic_without_creating_manual_backups() {
        let directory = tempfile::tempdir().expect("create temp directory");
        let destination = directory.path().join("project.recovery.json");
        std::fs::write(&destination, "old recovery").expect("write initial recovery");

        write_text_atomic(&destination, "new recovery").expect("replace recovery");

        assert_eq!(
            std::fs::read_to_string(&destination).unwrap(),
            "new recovery"
        );
        assert!(!backup_path(&destination, 1).exists());
    }

    #[test]
    fn recovery_project_id_cannot_escape_the_recovery_directory() {
        let directory = tempfile::tempdir().expect("create temp directory");
        let path = recovery_path(directory.path(), "../../another/project");

        assert_eq!(path.parent(), Some(directory.path()));
        assert_eq!(
            path.extension().and_then(|value| value.to_str()),
            Some("json")
        );
    }
}
