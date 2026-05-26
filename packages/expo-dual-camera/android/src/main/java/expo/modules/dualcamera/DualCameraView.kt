package expo.modules.dualcamera

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.TextView
import androidx.camera.view.PreviewView
import expo.modules.kotlin.viewevent.EventDispatcher

class DualCameraView(context: Context) : FrameLayout(context) {

    private val previewView: PreviewView
    private val errorView: TextView
    private var side: String = "back"

    val onCameraReady by EventDispatcher()
    val onMountError by EventDispatcher()

    init {
        previewView = PreviewView(context).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            implementationMode = PreviewView.ImplementationMode.PERFORMANCE
            scaleType = PreviewView.ScaleType.FILL_CENTER
            visibility = View.GONE
        }
        errorView = TextView(context).apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.BLACK)
            gravity = Gravity.CENTER
            visibility = View.GONE
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }
        addView(previewView)
        addView(errorView)
    }

    // MARK: - Prop setters

    fun setSide(newSide: String) {
        if (newSide == side) return
        val wasAttached = isAttachedToWindow
        if (wasAttached) DualCameraSessionManager.unregister(this)
        side = newSide
        if (wasAttached) DualCameraSessionManager.register(this, side, context)
    }

    fun setLens(lens: String) {
        DualCameraSessionManager.setBackLens(lens, context)
    }

    fun setZoom(zoom: Double) {
        DualCameraSessionManager.setZoom(side, zoom.toFloat())
    }

    fun setEnableTorch(enabled: Boolean) {
        DualCameraSessionManager.setTorch(enabled)
    }

    fun setFlash(mode: String) {
        DualCameraSessionManager.setFlash(mode)
    }

    fun setMirror(mirror: Boolean) {
        previewView.scaleX = if (mirror) -1f else 1f
    }

    fun setAutofocus(mode: String) {
        DualCameraSessionManager.setAutofocus(side, mode)
    }

    // MARK: - Preview

    fun getPreviewView(): PreviewView = previewView

    fun showPreview() {
        previewView.visibility = View.VISIBLE
        errorView.visibility = View.GONE
    }

    fun showError(message: String) {
        errorView.text = message
        errorView.visibility = View.VISIBLE
        previewView.visibility = View.GONE
        onMountError(mapOf("message" to message))
    }

    fun sessionDidStart() {
        onCameraReady(mapOf<String, Any>())
    }

    // MARK: - Lifecycle

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        DualCameraSessionManager.register(this, side, context)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        DualCameraSessionManager.unregister(this)
    }
}
