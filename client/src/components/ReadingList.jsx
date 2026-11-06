import { recordedTime, slots } from '../lib/readings.js';

export default function ReadingList({ readings, busy, editing, deleteId, deleteError, deleting,
  onEdit, onStartDelete, onCancelDelete, onConfirmDelete }) {
  return (
    <div role="region" aria-label="Recorded readings">
      <ul className="readings-list">
        {readings.map((reading) => {
          const label = slots.find((slot) => slot.value === reading.slot)?.label || reading.slot;
          return <li key={reading.id}>
            <div className="reading-row">
              <span className="reading-description"><span className={`slot-dot ${reading.slot}`} aria-hidden="true" />
                <span>{label}<time dateTime={reading.created_at} title="Time recorded" aria-label={`Recorded at ${recordedTime(reading.created_at)}`}> · {recordedTime(reading.created_at)}</time></span>
              </span>
              <span className="reading-value">{reading.value}<small>mg/dl</small></span>
              <div className="reading-actions">
                <button type="button" aria-label={`Edit ${label} reading`} disabled={busy || Boolean(editing)} onClick={() => onEdit(reading)}>Edit</button>
                <button className="delete-reading" type="button" aria-label={`Delete ${label} reading`} disabled={busy || Boolean(editing)} onClick={() => onStartDelete(reading.id)}>×</button>
              </div>
            </div>
            {deleteId === reading.id && <div className="delete-confirmation" role="group" aria-label={`Delete ${label} reading`}
              onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onCancelDelete(); }}>
              <p>Delete this reading?</p>
              {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
              <div className="confirmation-actions">
                <button className="secondary-button" disabled={busy} onClick={onCancelDelete}>Cancel</button>
                <button className="secondary-button" autoFocus disabled={busy} onClick={() => onConfirmDelete(reading.id)}>{deleting ? 'Deleting…' : 'Confirm delete'}</button>
              </div>
            </div>}
          </li>;
        })}
      </ul>
    </div>
  );
}
